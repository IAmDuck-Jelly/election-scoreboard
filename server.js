require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
app.use(cors());
app.use(express.static(path.join(__dirname, '.')));

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 5000, // 5 seconds timeout
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// API Routes

// Get LIFF Config
app.get('/api/config', (req, res) => {
    res.json({ liffId: process.env.LIFF_ID });
});

// Get Scores
app.get('/api/scores', async (req, res) => {
    try {
        // 1. Get all participants metadata from DB
        const participantsRes = await pool.query('SELECT * FROM participants ORDER BY id');
        const participants = participantsRes.rows;

        // 2. Aggregate scores from hourly_scores
        const scoresRes = await pool.query(`
            SELECT participant_id, SUM(score) as total_score 
            FROM hourly_scores 
            GROUP BY participant_id
        `);

        // 3. Create score map
        const scoreMap = {};
        scoresRes.rows.forEach(row => {
            scoreMap[row.participant_id] = parseInt(row.total_score || 0);
        });

        // 4. Merge
        const enrichedData = participants.map(p => ({
            id: p.id,
            name: p.name,
            area: p.party, // Map DB 'party' column to API 'area' field for frontend
            district: p.district_num, // Returning district_num from DB
            score: scoreMap[p.id] || 0
        }));

        res.json(enrichedData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Serve the main page with fallback (Catch-all)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Export for Vercel
module.exports = app;

// Only listen if running locally (not in a serverless environment)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}
