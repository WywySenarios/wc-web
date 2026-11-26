# wc-web

A small Astro/React frontend for `wc-harness`. One **Run** button clones the
suspended `wc-harness` CronJob into a one-off Job and streams its output over
SSE.

## How it works

- The server runs in the `wc` namespace with its own ServiceAccount.
- `POST /api/sessions` reads the CronJob's `jobTemplate`, creates a uniquely
  named Job, and returns its id.
- `GET /api/sessions/:id/events` replays the transcript and follows the harness
  container's log through the Kubernetes API.
- Runs are serialized: one active run at a time. The FUSE daemon holds one mount
  per project root and does not refcount it.
- Transcripts live on the `wc-web-state` PVC, so they survive Job TTL and
  web-pod restarts.

## Local development

Requires Node 22.23+ and a reachable cluster.

```sh
npm install
WC_WEB_STATE_DIR=./.state KUBECONFIG=~/.kube/configs/wc npm run dev
```

Open http://localhost:4321.

## Container

```sh
docker build -t wc-web:dev .
docker run --rm -p 127.0.0.1:4321:4321 \
  -e WC_WEB_STATE_DIR=/state -v "$PWD/.state:/state" wc-web:dev
```

Without a cluster the app serves `/api/health` and reports cluster errors on
`POST /api/sessions`.

## Deployment

Deployment is driven from the `wc` meta-repo (`make k3s-run`), which builds both
images, imports them into k3s, applies `k8s/`, and port-forwards the Service.

## Security

There is no authentication. The Service is ClusterIP-only and reached through
`kubectl port-forward`; do not expose it with a NodePort or Ingress. The
ServiceAccount can create Jobs in `wc` but cannot read Secrets.
