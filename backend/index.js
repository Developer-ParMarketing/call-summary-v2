// API server: receives calls from the dialer, serves the dashboard data.
import 'dotenv/config';
import dns from 'dns';
import { config } from './src/config/index.js';
import { connectDb } from './src/config/db.js';
import { createApp } from './src/app.js';
import { startZohoAutoRetry } from './src/services/zoho.service.js';

dns.setDefaultResultOrder('ipv4first'); // same as lead-upload (Zoho / token APIs over IPv4)

connectDb()
    .then(() => {
        createApp().listen(config.port, () => console.log(`Server running on http://localhost:${config.port}`));
        startZohoAutoRetry();
    })
    .catch((err) => {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    });