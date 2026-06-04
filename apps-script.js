export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      service: 'lms-self-compassion-vercel-proxy',
      configured: Boolean(process.env.APPS_SCRIPT_API_URL),
      message: process.env.APPS_SCRIPT_API_URL
        ? 'Proxy Vercel aktif dan APPS_SCRIPT_API_URL sudah terisi.'
        : 'Proxy Vercel aktif, tetapi APPS_SCRIPT_API_URL belum terisi.'
    });
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Gunakan POST.'
    });
  }

  let appsScriptUrl = String(process.env.APPS_SCRIPT_API_URL || '').trim();
  appsScriptUrl = appsScriptUrl.replace(/^['"]|['"]$/g, '');

  if (!appsScriptUrl) {
    return res.status(500).json({
      success: false,
      message: 'Environment variable APPS_SCRIPT_API_URL belum diisi di Vercel.'
    });
  }

  if (!appsScriptUrl.startsWith('https://script.google.com/macros/s/') || !appsScriptUrl.endsWith('/exec')) {
    return res.status(500).json({
      success: false,
      message: 'APPS_SCRIPT_API_URL tidak valid. Gunakan URL Web App Apps Script yang berakhir dengan /exec.'
    });
  }

  try {
    const payload = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});

    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';

    if (!text) {
      return res.status(502).json({
        success: false,
        message: 'Apps Script mengembalikan response kosong. Pastikan Code.gs memiliki doPost(e), deployment memakai versi terbaru, dan akses Web App adalah Anyone.',
        upstreamStatus: response.status,
        upstreamContentType: contentType
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({
        success: false,
        message: 'Apps Script tidak mengembalikan JSON valid. Biasanya deployment belum memakai Code.gs API terbaru atau akses Web App belum Anyone.',
        upstreamStatus: response.status,
        upstreamContentType: contentType,
        rawPreview: text.slice(0, 500)
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Proxy Vercel error: ' + error.message
    });
  }
}
