// API server: receives calls from the dialer, serves the dashboard data.
import 'dotenv/config';
import { config } from './src/config/index.js';
import { connectDb } from './src/config/db.js';
import { createApp } from './src/app.js';

connectDb()
    .then(() => {
        createApp().listen(config.port, () => console.log(`Server running on http://localhost:${config.port}`));
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    });
