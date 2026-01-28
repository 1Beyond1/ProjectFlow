import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

/**
 * 压缩图片到指定大小以下 (默认 500KB)
 * 采用迭代压缩算法：
 * 1. 初始尝试 resize 到 MAX_WIDTH (1600) + quality 0.7
 * 2. 如果仍超标，降低 resize 到 FALLBACK_WIDTH (1280) + quality 0.6
 * 3. 仍超标则继续降低 quality
 * 
 * @param uri 图片原始 URI
 * @param maxSizeKB 目标最大尺寸 (KB), 默认 500
 * @returns 压缩后的图片结果对象 { uri, width, height, base64 }
 */
export const compressImage = async (uri: string, maxSizeKB = 500) => {
    const MAX_WIDTH = 1600;
    const FALLBACK_WIDTH = 1280;
    const MIN_QUALITY = 0.4;

    let targetWidth = MAX_WIDTH;
    let targetQuality = 0.7;
    let iteration = 0;
    let result = null;

    // 获取文件大小辅助函数 (如果是 base64，计算大致大小；如果是 file uri，这里仅模拟，实际通过 manipulateAsync 输出判断)
    // Expo Image Manipulator 的 base64 输出可以直接计算大小: length * 0.75

    while (iteration < 5) {
        try {
            console.log(`[ImageCompression] Iteration ${iteration + 1}: width=${targetWidth}, quality=${targetQuality}`);

            result = await manipulateAsync(
                uri,
                [{ resize: { width: targetWidth } }],
                { compress: targetQuality, format: SaveFormat.JPEG, base64: true }
            );

            if (!result.base64) {
                throw new Error('Failed to generate base64 for size checking');
            }

            const sizeKB = (result.base64.length * 0.75) / 1024;
            console.log(`[ImageCompression] Result size: ${sizeKB.toFixed(2)} KB`);

            if (sizeKB <= maxSizeKB) {
                console.log(`[ImageCompression] Success! Final size: ${sizeKB.toFixed(2)} KB`);
                return result;
            }

            // 调整参数进行下一次尝试
            if (targetWidth > FALLBACK_WIDTH) {
                targetWidth = FALLBACK_WIDTH;
            } else {
                targetQuality -= 0.1;
            }

            if (targetQuality < MIN_QUALITY) {
                console.warn('[ImageCompression] Reached minimum quality, returning best effort.');
                return result;
            }

            iteration++;
        } catch (error) {
            console.error('[ImageCompression] Error during compression:', error);
            throw error;
        }
    }

    return result || await manipulateAsync(uri, [{ resize: { width: 1024 } }], { compress: 0.5, format: SaveFormat.JPEG });
};
