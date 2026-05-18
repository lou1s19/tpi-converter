self.importScripts('../vendor/heic2any.min.js');

self.onmessage = async (event) => {
  const { id, arrayBuffer, quality } = event.data || {};

  try {
    const inputBlob = new Blob([arrayBuffer]);
    const result = await self.heic2any({
      blob: inputBlob,
      toType: 'image/jpeg',
      quality
    });

    const outputBlob = Array.isArray(result) ? result[0] : result;
    const buffer = await outputBlob.arrayBuffer();
    self.postMessage({ id, success: true, buffer }, [buffer]);
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error?.message || String(error)
    });
  }
};
