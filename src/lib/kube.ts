import { Writable } from "node:stream";

import * as k8s from "@kubernetes/client-node";

import { CRONJOB, NAMESPACE } from "@/lib/config";
import type { RunStatus } from "@/lib/types";

let kubeConfig: k8s.KubeConfig | null = null;
let batchApi: k8s.BatchV1Api | null = null;
let coreApi: k8s.CoreV1Api | null = null;

function config(): k8s.KubeConfig {
  if (kubeConfig) return kubeConfig;
  const config = new k8s.KubeConfig();
  if (process.env.KUBERNETES_SERVICE_HOST) {
    config.loadFromCluster();
  } else {
    config.loadFromDefault();
  }
  kubeConfig = config;
  return config;
}

function batch(): k8s.BatchV1Api {
  if (!batchApi) batchApi = config().makeApiClient(k8s.BatchV1Api);
  return batchApi;
}

function core(): k8s.CoreV1Api {
  if (!coreApi) coreApi = config().makeApiClient(k8s.CoreV1Api);
  return coreApi;
}

export async function createJobFromCronJob(jobName: string): Promise<void> {
  const cron = await batch().readNamespacedCronJob({
    namespace: NAMESPACE,
    name: CRONJOB,
  });
  const template = cron.spec?.jobTemplate?.spec;
  if (!template) throw new Error(`cronjob ${CRONJOB} has no jobTemplate.spec`);

  const job: k8s.V1Job = {
    metadata: {
      name: jobName,
      namespace: NAMESPACE,
      labels: {
        "app.kubernetes.io/name": "wc-harness",
        "app.kubernetes.io/managed-by": "wc-web",
      },
    },
    spec: {
      ...template,
      ttlSecondsAfterFinished: template.ttlSecondsAfterFinished ?? 3600,
    },
  };
  await batch().createNamespacedJob({ namespace: NAMESPACE, body: job });
}

export async function jobStatus(jobName: string): Promise<RunStatus> {
  try {
    const job = await batch().readNamespacedJob({
      namespace: NAMESPACE,
      name: jobName,
    });
    return statusOf(job);
  } catch (err) {
    if (isNotFound(err)) return "unknown";
    throw err;
  }
}

function statusOf(job: k8s.V1Job): RunStatus {
  const status = job.status;
  if (!status) return "pending";
  if ((status.succeeded ?? 0) > 0) return "completed";
  if ((status.failed ?? 0) > 0) return "failed";
  if ((status.active ?? 0) > 0) return "running";
  return "pending";
}

function isNotFound(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && (err as { code?: number }).code === 404,
  );
}

export interface PodRef {
  name: string;
  started: boolean;
}

export async function findPod(jobName: string): Promise<PodRef | null> {
  const pods = await core().listNamespacedPod({
    namespace: NAMESPACE,
    labelSelector: `job-name=${jobName}`,
  });
  const pod = pods.items?.find((item) => item.metadata?.name);
  if (!pod?.metadata?.name) return null;
  return { name: pod.metadata.name, started: podStarted(pod) };
}

function podStarted(pod: k8s.V1Pod): boolean {
  const phase = pod.status?.phase;
  if (phase === "Succeeded" || phase === "Failed") return true;
  return Boolean(
    pod.status?.containerStatuses?.some(
      (status) => status.name === "wc-harness" && status.state?.running,
    ),
  );
}

export async function waitForPod(
  jobName: string,
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pod = await findPod(jobName);
    if (pod?.started) return pod.name;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

export interface LogFollow {
  done: Promise<void>;
  stop: () => void;
}

/** Follow the harness container's merged stdout/stderr and emit whole lines. */
export function followLogs(
  pod: string,
  onLine: (line: string) => void,
): LogFollow {
  const stream = new LineStream(onLine);
  const ready = new k8s.Log(config()).log(
    NAMESPACE,
    pod,
    "wc-harness",
    stream,
    {
      follow: true,
      timestamps: false,
    },
  );

  const done = new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    ready.catch(reject);
  });

  return {
    done,
    stop: () => {
      void ready.then((controller) => controller.abort()).catch(() => {});
      stream.end();
    },
  };
}

class LineStream extends Writable {
  private buffer = "";
  private readonly onLine: (line: string) => void;

  constructor(onLine: (line: string) => void) {
    super();
    this.onLine = onLine;
  }

  _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.buffer += chunk.toString("utf8");
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      this.onLine(line);
      index = this.buffer.indexOf("\n");
    }
    callback();
  }

  _final(callback: (error?: Error | null) => void): void {
    if (this.buffer.length > 0) {
      this.onLine(this.buffer);
      this.buffer = "";
    }
    callback();
  }
}
