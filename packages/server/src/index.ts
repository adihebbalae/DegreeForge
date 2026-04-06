import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// TASK-012 will implement this properly
app.post('/api/chat', (_req, res) => res.json({ message: 'stub' }));

app.listen(3001, () => console.log('Server running on port 3001'));
