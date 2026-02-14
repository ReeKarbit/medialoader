const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.json({ status: 'error', text: 'Method not allowed' });

    const input = req.body;
    if (!input || !input.url) return res.json({ status: 'error', text: 'URL diperlukan' });

    const url = input.url.trim();
    const format = input.downloadMode || 'auto';
    const quality = input.videoQuality || '720';
    const debugLog = [];

    const platform = detectPlatform(url);

    // TikTok providers chain
    const providers = [providerTikwm, providerSnaptik, providerDouyin];
    let finalResult = null;
    let lastError = '';

    for (const provider of providers) {
        try {
            debugLog.push(`Trying: ${provider.name}`);
            const result = await provider(url, format, quality, platform, debugLog);
            if (result && result.status && result.status !== 'error') {
                finalResult = result;
                debugLog.push(`Success: ${provider.name}`);
                break;
            }
            if (result && result.text) {
                lastError = result.text;
                debugLog.push(`Failed ${provider.name}: ${result.text}`);
            }
        } catch (e) {
            lastError = e.message;
            debugLog.push(`Exception ${provider.name}: ${e.message}`);
        }
    }

    if (finalResult) {
        if (req.query && req.query.debug) finalResult.debug = debugLog;
        return res.json(finalResult);
    }

    const response = {
        status: 'error',
        text: `Tidak dapat memproses link saat ini. ${lastError}. Silakan coba lagi nanti.`
    };
    if (req.query && req.query.debug) response.debug = debugLog;
    return res.json(response);
};

// ===== PROVIDERS =====

async function providerTikwm(url, format, quality, platform, log) {
    if (platform !== 'tiktok') return null;

    const apiUrl = 'https://www.tikwm.com/api/';
    const postData = `url=${encodeURIComponent(url)}&hd=1`;

    log.push('TikWM trying POST');
    let resp = await fetchUrl(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: postData
    });

    let data = null;
    try { data = JSON.parse(resp); } catch (e) { }

    // If POST failed, try GET
    if (!data || (data.code !== undefined && data.code !== 0)) {
        log.push('TikWM POST failed, trying GET');
        resp = await fetchUrl(`${apiUrl}?url=${encodeURIComponent(url)}&hd=1`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        try { data = JSON.parse(resp); } catch (e) { }
    }

    if (!data) return { status: 'error', text: 'TikWM no response' };
    if (data.code === undefined || data.code !== 0) {
        return { status: 'error', text: 'TikWM error: ' + (data.msg || 'Unknown') };
    }

    const video = data.data;
    const variants = [];

    const hdUrl = video.hdplay || video.play || null;
    const sdUrl = video.play || video.hdplay || null;
    const musicUrl = video.music || null;
    const wmUrl = video.wmplay || null;

    if (hdUrl) {
        variants.push({
            type: 'video-hd',
            name: 'HD NO WATERMARK (MP4)',
            url: hdUrl,
            size_bytes: video.hd_size ? parseInt(video.hd_size) : (video.size ? parseInt(video.size) : null)
        });
    }

    if (sdUrl) {
        variants.push({
            type: 'video-sd',
            name: 'NO WATERMARK (MP4)',
            url: sdUrl,
            size_bytes: video.size ? parseInt(video.size) : (video.hd_size ? parseInt(video.hd_size) : null)
        });
    }

    const audioUrl = musicUrl || hdUrl;
    if (audioUrl) {
        variants.push({
            type: 'audio',
            name: 'MP3 AUDIO',
            url: audioUrl,
            size_bytes: video.music_info && video.music_info.size ? parseInt(video.music_info.size) : null
        });
    }

    if (wmUrl) {
        variants.push({
            type: 'video-watermark',
            name: 'WITH WATERMARK (MP4)',
            url: wmUrl,
            size_bytes: video.wm_size ? parseInt(video.wm_size) : null
        });
    }

    const mainUrl = hdUrl || sdUrl || wmUrl || musicUrl || null;
    if (mainUrl) {
        return {
            status: 'tunnel',
            url: mainUrl,
            filename: 'tiktok_' + (video.id || 'video') + '.mp4',
            thumb: video.cover || video.origin_cover || null,
            title: video.title || 'TikTok Video',
            author: (video.author && video.author.nickname) || 'TikTok User',
            variants: variants
        };
    }

    return { status: 'error', text: 'Video URL not found in TikWM' };
}

async function providerSnaptik(url, format, quality, platform, log) {
    if (platform !== 'tiktok') return null;

    const apiUrl = 'https://api.tik.fail/api/grab';
    log.push('Snaptik(tik.fail) trying');

    const resp = await fetchUrl(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        body: `url=${encodeURIComponent(url)}`
    });

    let data;
    try { data = JSON.parse(resp); } catch (e) { return null; }
    if (!data || data.status !== 'success') {
        log.push('Snaptik failed: ' + (data?.status || 'unknown'));
        return null;
    }

    return {
        status: 'tunnel',
        url: data.video || data.nwm_video_url || '',
        filename: 'tiktok_snaptik.mp4',
        title: data.desc || 'TikTok Video'
    };
}

async function providerDouyin(url, format, quality, platform, log) {
    if (platform !== 'tiktok') return null;

    const apiUrl = 'https://api.douyin.wtf/api?url=' + encodeURIComponent(url);
    log.push('Douyin trying GET');

    const resp = await fetchUrl(apiUrl);
    let data;
    try { data = JSON.parse(resp); } catch (e) { return null; }

    if (!data || data.status === 'failed') {
        log.push('Douyin failed');
        return null;
    }

    if (data.video_data && data.video_data.nwm_video_url) {
        return {
            status: 'tunnel',
            url: data.video_data.nwm_video_url,
            filename: 'tiktok_douyin.mp4',
            title: data.desc || 'TikTok Video'
        };
    }

    return null;
}

// ===== UTILITIES =====

function detectPlatform(url) {
    if (/tiktok\.com/i.test(url)) return 'tiktok';
    if (/youtu\.?be/i.test(url)) return 'youtube';
    if (/instagram\.com/i.test(url)) return 'instagram';
    if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
    if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
    return 'unknown';
}

async function fetchUrl(url, options = {}) {
    try {
        const defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        const finalOptions = {
            ...options,
            headers: { ...defaultHeaders, ...(options.headers || {}) },
            timeout: 25000,
            redirect: 'follow'
        };

        const response = await fetch(url, finalOptions);
        return await response.text();
    } catch (e) {
        return null;
    }
}
