/**
 * Resolver untuk Node --experimental-strip-types.
 *
 * Kode worker memakai import ala TypeScript tanpa ekstensi (`from './time'`),
 * yang tidak bisa di-resolve oleh loader ESM bawaan. Hook ini menambah
 * `.ts` (dan `/index.ts`) sebagai kandidat, tanpa mengubah kode produksi.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        return await nextResolve(specifier + suffix, context);
      } catch {
        /* coba kandidat berikutnya */
      }
    }
  }
  return nextResolve(specifier, context);
}
