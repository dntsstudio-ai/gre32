// ============================================================
//  worker/src/md5.js — Чистая реализация MD5 (RFC 1321)
//  Нужна, потому что Robokassa по умолчанию подписывает платежи MD5,
//  а Web Crypto (доступный в Cloudflare Workers) умеет только SHA-*.
//  Проверена на эталонных тест-векторах RFC 1321.
// ============================================================
export function md5(str) {
    function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
    function add32(a, b) { return (a + b) & 0xffffffff; }

    const s = [
        7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
        5, 9,14,20, 5, 9,14,20, 5, 9,14,20, 5, 9,14,20,
        4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
        6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21
    ];
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0;

    const bytes  = new TextEncoder().encode(str);
    const bitLen = bytes.length * 8;

    const padLen = ((bytes.length % 64) < 56) ? (56 - (bytes.length % 64)) : (120 - (bytes.length % 64));
    const total  = bytes.length + padLen + 8;
    const buf    = new Uint8Array(total);
    buf.set(bytes, 0);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, bitLen >>> 0, true);
    dv.setUint32(total - 4, Math.floor(bitLen / 4294967296) >>> 0, true);

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

    for (let chunkStart = 0; chunkStart < total; chunkStart += 64) {
        const M = new Uint32Array(16);
        for (let j = 0; j < 16; j++) M[j] = dv.getUint32(chunkStart + j * 4, true);

        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
            let F, g;
            if (i < 16)      { F = (B & C) | (~B & D);   g = i; }
            else if (i < 32) { F = (D & B) | (~D & C);   g = (5 * i + 1) % 16; }
            else if (i < 48) { F = B ^ C ^ D;             g = (3 * i + 5) % 16; }
            else             { F = C ^ (B | ~D);          g = (7 * i) % 16; }
            F = add32(add32(add32(F, A), K[i]), M[g]);
            A = D; D = C; C = B;
            B = add32(B, rotl(F, s[i]));
        }
        a0 = add32(a0, A); b0 = add32(b0, B); c0 = add32(c0, C); d0 = add32(d0, D);
    }

    function toHexLE(n) {
        n = n >>> 0;
        let out = '';
        for (let i = 0; i < 4; i++) out += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
        return out;
    }
    return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}
