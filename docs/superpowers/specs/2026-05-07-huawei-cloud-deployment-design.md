# Huawei Cloud Deployment Design

Date: 2026-05-07

## Purpose

Migrate the Prompt Gallery web app from the current local/Supabase-backed runtime to a cost-conscious Huawei Cloud deployment for personal and small-group use.

The target deployment keeps the frontend cheap and static, keeps secrets on the backend server only, and keeps the database private inside the cloud network.

## Target Architecture

Use the following first production architecture:

- React frontend: build with Vite and upload `web/dist/` to an OBS static website bucket.
- Frontend domain: bind a custom domain to OBS and optionally enable CDN for HTTPS, caching, and better access latency.
- Backend API: deploy the Node/Express API on one Flexus application server L instance.
- API domain: use a separate API domain such as `api.example.com`, terminated by Nginx on the Flexus L instance and proxied to the Node process.
- Database: use Huawei Cloud RDS for PostgreSQL in the same region and private network path as the Flexus L instance.
- Object storage: use OBS for gallery images and experiment images.
- AI service: keep the existing Huawei MaaS integration on the backend.

The first production version should not introduce CCI, CCE, Kubernetes, or a container platform. Docker can be added later on the Flexus L instance if manual Node deployment becomes painful.

## Network And Security

Flexus L and RDS must be created in the same region and connected through an internal network path. RDS PostgreSQL should be accessed through its private endpoint, not a public endpoint.

Security group intent:

- RDS inbound: allow PostgreSQL `5432` only from the Flexus L private IP or the Flexus L security group/subnet, depending on what the Huawei Cloud console supports for the selected resources.
- RDS public access: disabled.
- Flexus L inbound: allow `80` and `443` from the internet; restrict `22` to the user's own fixed IP when possible.
- Flexus L outbound: allow HTTPS to Huawei MaaS and OBS endpoints; allow private PostgreSQL access to RDS.

Flexus L has fixed networking constraints after creation, including default fixed public/private IP and default VPC behavior. Create the production Flexus L and RDS only after confirming they can communicate privately in the chosen region/VPC.

## Application Changes

The current app cannot be migrated by only changing environment variables. It uses Supabase client APIs in the browser and Supabase service-role APIs on the server for data, storage, and workflow events. Huawei RDS and OBS do not provide Supabase PostgREST, Storage API, or RLS behavior.

Required application boundary changes:

- Browser code must stop importing or calling Supabase directly.
- The backend API becomes the only data API for gallery metadata, prompt cases, uploads, experiment saves, and workflow events.
- PostgreSQL access moves into server-side repository modules using `DATABASE_URL`.
- OBS access moves into server-side storage modules using Huawei OBS credentials.
- Public gallery image URLs should be produced from OBS/CDN configuration, not Supabase public storage URLs.
- Private experiment images should be uploaded through the backend and fetched by the backend for MaaS recommendation and rewrite requests.

## Runtime Configuration

Frontend build-time configuration:

- `VITE_API_BASE_URL`: public API origin, for example `https://api.example.com`.

Backend runtime configuration:

- `DATABASE_URL`: RDS PostgreSQL private connection string.
- `OBS_ENDPOINT`: OBS endpoint for the selected Huawei Cloud region.
- `OBS_REGION`: region identifier used in deployment docs and bucket naming.
- `OBS_ACCESS_KEY_ID`: backend-only OBS access key.
- `OBS_SECRET_ACCESS_KEY`: backend-only OBS secret key.
- `OBS_GALLERY_BUCKET`: public gallery image bucket.
- `OBS_EXPERIMENT_BUCKET`: private experiment image bucket.
- `PUBLIC_GALLERY_ASSET_BASE_URL`: CDN or OBS public base URL for gallery images.
- `HUAWEI_MAAS_API_KEY`, `HUAWEI_MAAS_CHAT_COMPLETIONS_URL`, `HUAWEI_MAAS_MODEL`, `HUAWEI_MAAS_VISION_CHAT_COMPLETIONS_URL`, `HUAWEI_MAAS_VISION_MODEL`: existing MaaS configuration.

Do not expose database credentials, OBS AK/SK, or MaaS keys to the browser.

## Migration Sequence

1. Add backend-owned data and storage APIs while keeping local tests green.
2. Convert the browser to load gallery data from backend APIs instead of Supabase.
3. Convert upload/download and experiment save paths from Supabase Storage to OBS.
4. Add PostgreSQL import and validation scripts for RDS.
5. Provision Huawei Cloud resources manually in the console and record values in environment files on the server.
6. Deploy backend API to Flexus L and frontend build output to OBS/CDN.
7. Run real browser verification through Browser Use before PR completion or production handoff.

## Acceptance Criteria

- `npm -C web test`, `npm -C web run build`, and `npm -C web run lint` pass locally.
- The app can run locally with PostgreSQL-compatible database access and mocked or real OBS configuration.
- The frontend bundle no longer requires `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY`.
- The backend no longer requires `SUPABASE_URL` or `SUPABASE_SECRET_KEY` for normal runtime.
- Gallery import and validation can target a PostgreSQL database and OBS buckets.
- In cloud verification, the frontend loads from OBS/CDN, API calls reach the Flexus L backend over HTTPS, the backend reaches RDS over private networking, and image uploads/recommend/rewrite/experiment save complete.

## References

- Huawei Cloud OBS custom-domain static website guide: https://support.huaweicloud.com/dnsw-ctf/dnsw_01.html
- Huawei Cloud CDN domain configuration overview: https://support.huaweicloud.com/intl/zh-cn/usermanual-cdn/cdn_01_0001.html
- Huawei Cloud RDS PostgreSQL private connectivity troubleshooting: https://support.huaweicloud.com/intl/en-us/rds-pg_faq/rds_faq_0020.html
- Huawei Cloud Flexus L network connectivity FAQ: https://support.huaweicloud.com/flexusl_faq/faq_network_0004.html
- Huawei Cloud OBS Node.js SDK install guide: https://support.huaweicloud.com/intl/en-us/sdk-nodejs-devg-obs/obs_29_0105.html
