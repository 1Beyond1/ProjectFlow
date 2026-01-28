import * as Crypto from 'expo-crypto';

const formatUuid = (bytes: Uint8Array) => {
    // Per RFC 4122 section 4.4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const getWebRandomBytes = () => {
    const webCrypto = (globalThis as any)?.crypto;
    if (webCrypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        webCrypto.getRandomValues(bytes);
        return bytes;
    }
    return null;
};

const getMathRandomBytes = () => {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
};

/**
 * UUID v4 generator with web fallback for non-secure contexts.
 */
export const generateUUID = () => {
    if (typeof Crypto.randomUUID === 'function') {
        try {
            return Crypto.randomUUID();
        } catch {
            // Fall through to web-safe generator when randomUUID is unavailable.
        }
    }
    const bytes = getWebRandomBytes() ?? getMathRandomBytes();
    return formatUuid(bytes);
};
