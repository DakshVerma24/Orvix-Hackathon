import crypto from 'node:crypto';
import 'dotenv/config';

let cloudinarySDK = null;
try {
  const mod = await import('cloudinary');
  cloudinarySDK = mod.v2 || mod.default?.v2 || mod.default;
  if (cloudinarySDK && process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinarySDK.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
} catch {
 console.log("Everything is fine...");
}

export async function uploadToCloudinary(fileInput, options = {}) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName) {
    throw new Error('CLOUDINARY_CLOUD_NAME is not set. Please add it to your .env file.');
  }

  if (cloudinarySDK && apiKey && apiSecret) {
    const result = await cloudinarySDK.uploader.upload(fileInput, {
      folder: options.folder || 'nestfind_pgs',
      resource_type: 'auto',
      ...options,
    });
    return result.secure_url;
  }

  const formData = new FormData();
  formData.append('file', fileInput);
  const folder = options.folder || 'nestfind_pgs';
  formData.append('folder', folder);

  if (uploadPreset) {
    formData.append('upload_preset', uploadPreset);
  } else if (apiKey && apiSecret) {
    const timestamp = Math.round(Date.now() / 1000);
    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');
    formData.append('api_key', apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
  } else {
    console.log("API Key has been outdated, or is not been uploaded.");
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Cloudinary upload failed: ${response.statusText}`);
  }

  return data.secure_url;
}

export default cloudinarySDK;
