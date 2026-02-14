const fetch = require('node-fetch');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = req.query.url;

    if (!url) {
        return res.json({ error: 'No URL', size: 0, formatted: 'UNKNOWN' });
    }

    if (!url.startsWith('http')) {
        return res.json({ error: 'Invalid URL', size: 0, formatted: 'UNKNOWN' });
    }

    try {
        const response = await fetch(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.google.com/'
            },
            redirect: 'follow',
            timeout: 10000
        });

        const contentLength = response.headers.get('Content-Length');

        if (response.ok && contentLength && parseInt(contentLength) > 0) {
            const bytes = parseInt(contentLength);
            const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            const formatted = parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];

            return res.json({ size: bytes, formatted: formatted });
        }

        return res.json({ size: 0, formatted: 'UNKNOWN' });
    } catch (error) {
        return res.json({ size: 0, formatted: 'UNKNOWN' });
    }
};
