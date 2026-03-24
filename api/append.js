const { put } = require('@vercel/blob');
const { Client } = require('@notionhq/client');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const { claimId, file } = req.body;

        if (!claimId || !file) {
            return res.status(400).json({ success: false, message: 'Missing claimId or file' });
        }

        // 1. Upload file to Vercel Blob
        const base64Data = file.data.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        const blob = await put(`claims/${Date.now()}-${file.name}`, buffer, {
            access: 'public',
            contentType: file.type,
            token: (process.env.BLOB_READ_WRITE_TOKEN || '').trim()
        });

        // 2. Append block to Notion page
        const notionKey = (process.env.NOTION_API_KEY || '').trim();
        if (notionKey) {
            const notion = new Client({ auth: notionKey });

            await notion.blocks.children.append({
                block_id: claimId,
                children: [
                    {
                        object: 'block',
                        type: 'image',
                        image: {
                            type: 'external',
                            external: { url: blob.url }
                        }
                    }
                ]
            });

            // Update the "비고" field to increase file count or just log
            // (Optional: we could fetch the page and update the note, but let's keep it simple for speed)
        }

        return res.status(200).json({
            success: true,
            url: blob.url
        });

    } catch (error) {
        console.error(`❌ [${claimId}] Append error (${file?.name}):`, error);
        return res.status(500).json({
            success: false,
            message: `Append failed: ${error.message} (File: ${file?.name})`
        });
    }
};
