"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = __importDefault(require("https"));
function getUrl(urlStr) {
    return new Promise((resolve, reject) => {
        https_1.default.get(urlStr, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        }).on('error', reject);
    });
}
async function main() {
    try {
        const res = await getUrl('https://gaytri-commercial-smart-erp.onrender.com/');
        console.log('Status:', res.status);
        console.log('Headers:', res.headers);
        console.log('Body:', res.body);
    }
    catch (err) {
        console.error('Fetch failed:', err.message);
    }
}
main();
