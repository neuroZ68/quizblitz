import QRCode from 'qrcode';

/**
 * Generate a QR code as a data URL
 * @param {string} url - URL to encode
 * @param {object} opts - Options: width, margin, color
 * @returns {Promise<string>} data URL of the QR code image
 */
export async function generateQRDataURL(url, opts = {}) {
    const options = {
        width: opts.width || 280,
        margin: opts.margin || 2,
        color: {
            dark: opts.darkColor || '#1a1a2e',
            light: opts.lightColor || '#ffffff'
        },
        errorCorrectionLevel: 'M'
    };

    return QRCode.toDataURL(url, options);
}

/**
 * Generate a QR code and render it into a container element
 */
export async function renderQRCode(containerEl, url, opts = {}) {
    const dataUrl = await generateQRDataURL(url, opts);
    containerEl.innerHTML = `<img src="${dataUrl}" alt="QR Code to join game" class="qr-image" />`;
    return dataUrl;
}
