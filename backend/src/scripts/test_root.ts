import https from 'https';

function getUrl(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(urlStr, (res) => {
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
  } catch (err: any) {
    console.error('Fetch failed:', err.message);
  }
}

main();
