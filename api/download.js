const fetch = require('node-fetch');

module.exports = async (req, res) => {
    const url = req.query.url;
    const filename = (req.query.filename || 'download.mp4').replace(/[^a-zA-Z0-9_\-\.]/g, '_');

    if (!url) {
        return res.status(400).send('Error: No URL provided.');
    }

    // Basic validation
    if (!url.startsWith('http')) {
        return res.status(400).send('Error: Only HTTP/HTTPS URLs allowed.');
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
                'Referer': 'https://www.youtube.com/'
            },
            redirect: 'follow'
        });

        if (!response.ok) {
            return res.status(500).send(`Error downloading file: HTTP ${response.status}`);
        }

        // Set download headers
        res.setHeader('Content-Description', 'File Transfer');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Expires', '0');
        res.setHeader('Cache-Control', 'must-revalidate');
        res.setHeader('Pragma', 'public');

        // Forward Content-Length if available
        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        // Pipe the response body to the client
        response.body.pipe(res);
    } catch (error) {
        return res.status(500).send('Error downloading file: ' + error.message);
    }
};
