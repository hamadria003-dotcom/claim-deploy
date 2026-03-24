const { put } = require('@vercel/blob');
const { Client } = require('@notionhq/client');

// Vercel config: increase body size limit for base64 file uploads
module.exports.config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};

const handler = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = req.body;
        if (!body || !body.claimData) {
            return res.status(400).json({ success: false, message: 'No claim data received' });
        }

        const { claimData, files } = body;

        // 1. Upload files to Vercel Blob (Optional part of initial submit)
        const fileUrls = [];
        const filesToProcess = files || [];
        if (filesToProcess.length > 0) {
            for (const file of filesToProcess) {
                try {
                    const base64Data = file.data.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');

                    const blob = await put(`claims/${Date.now()}-${file.name}`, buffer, {
                        access: 'public',
                        contentType: file.type,
                        token: (process.env.BLOB_READ_WRITE_TOKEN || '').trim()
                    });

                    fileUrls.push({
                        name: file.name,
                        url: blob.url,
                        docKey: file.docKey
                    });
                } catch (blobErr) {
                    console.error('Blob upload failed:', blobErr.message);
                }
            }
        }

        // 2. Create entry in Notion
        let notionResult = null;
        const notionKey = (process.env.NOTION_API_KEY || '').trim();
        const notionDbId = (process.env.NOTION_DATABASE_ID || '').trim();
        if (notionKey && notionDbId) {
            const notion = new Client({ auth: notionKey });

            // AI가 자동으로 청구 유형을 판별할 것이므로 기본 유형만 설정
            const typeOptions = (claimData.types || []).map(t => ({ name: t }));

            // ── 비고 텍스트 (Sync Bridge가 이 건을 감지할 수 있도록 마커 포함) ──
            // Initial sync markers: [접수] + [Vercel Cloud]
            let noteText = `병원: ${claimData.hospital}\n첨부파일: ${fileUrls.length}개`;
            noteText += `\n🌐 접수 경로: Vercel Cloud`;
            if (claimData.company) noteText += `\n보험사: ${claimData.company}`;
            if (claimData.memo) noteText += `\n메모: ${claimData.memo}`;

            const properties = {
                "질병명/실비/진단/수술": {
                    title: [{ text: { content: `[접수] ${claimData.name} - ${claimData.hospital}` } }]
                },
                "고객명": {
                    rich_text: [{ text: { content: claimData.name } }]
                },
                "접수": {
                    date: { start: new Date().toISOString().split('T')[0] }
                },
                "내원일": {
                    date: { start: claimData.date }
                },
                "입/통원": {
                    multi_select: typeOptions.length > 0 ? typeOptions : [{ name: '통원' }]
                },
                "비고": {
                    rich_text: [{ text: { content: noteText.slice(0, 2000) } }]
                }
            };

            // Build page content with image blocks (only files with valid URLs)
            const children = fileUrls.filter(f => f.url).map(f => ({
                object: 'block',
                type: 'image',
                image: {
                    type: 'external',
                    external: { url: f.url }
                }
            }));

            try {
                notionResult = await notion.pages.create({
                    parent: { database_id: notionDbId },
                    properties: properties,
                    children: children.length > 0 ? children : undefined
                });
            } catch (notionErr) {
                console.error('Notion create failed:', notionErr.message);
                throw new Error(`Notion creation failed: ${notionErr.message}`);
            }
        }

        const submission = {
            id: notionResult ? notionResult.id : Date.now().toString(36),
            timestamp: new Date().toISOString(),
            ...claimData,
            fileCount: fileUrls.length,
            notionStatus: notionResult ? 'success' : 'skipped',
            source: 'vercel'
        };

        console.log('📋 새 보험 접수 (Vercel → 노션):', JSON.stringify(submission, null, 2));

        return res.status(200).json({
            success: true,
            message: '✅ 정보 접수 완료! 서류를 전송합니다.',
            claimId: submission.id,
            fileCount: submission.fileCount
        });

    } catch (error) {
        console.error('❌ 접수 오류:', error);
        return res.status(500).json({
            success: false,
            message: '서버 오류: ' + error.message
        });
    }
};

module.exports = handler;
