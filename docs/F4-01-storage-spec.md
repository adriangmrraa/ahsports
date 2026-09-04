# SDD — F4-01: Storage adapter (src/lib/storage.ts)

Fase: F4 · Estado: `- [ ] F4-01`

## What (problema)
El sistema necesita un contrato de almacenamiento de archivos (adjuntos: escudos,
logos, sponsors, planillas) con adapter de local (dev/seed) y la puerta a
S3/R2/Cloudflare en prod. Es la base de las tareas F4-02..F4-06 (adjuntos + arte).

## Spec (criterios de aceptación — del BUILD_PROGRESS-F4)
1. `src/lib/storage.ts` con interfaz `StorageAdapter { upload(file, path, mimeType):
   Promise<{url,size}>; delete(url): Promise<void> }`.
2. `localStorageAdapter` → guarda en `/public/uploads/<path>` con `fs.writeFile`.
3. `s3StorageAdapter` → stub honesto para F5+ (lanza PaymentError-like / devuelve
   NOT_IMPLEMENTED honesto, NO inventa).
4. `activeStorage = process.env.STORAGE_PROVIDER === "s3" ? s3 : localStorage`.
5. Validación: mimes permitidos = [png, jpeg, svg+xml, webp, pdf, postscript,
   illustrator, photoshop]; tamaño máx 5MB.
6. Verificar: `npx tsc --noEmit` EXIT 0 · upload PNG pequeño → archivo en
   `/public/uploads/` → URL accesible.

## Design
- `src/lib/storage.ts` + export desde `src/lib/index` si existe.

## Anti-invención
NO crea la url si no escribió el archivo; devuelve el path real. s3 es stub
honesto (no finge subir).

## How to verify
- `npx tsc --noEmit` exit 0 en App de gestion.
- Mark F4-01 `[x]@2026-09-04` tras commit.