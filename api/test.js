module.exports = (req, res) => {
    res.status(200).json({ ok: true, method: req.method, timestamp: new Date().toISOString() });
};
