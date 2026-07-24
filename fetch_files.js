const https = require('https');
const fs = require('fs');

function download(file) {
  https.get(`https://raw.githubusercontent.com/ugommirikwe/sa-license-decoder/master/${file}`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      fs.mkdirSync('docs/sa-dl', { recursive: true });
      fs.writeFileSync(`docs/sa-dl/${file}`, data);
      console.log(`Downloaded ${file}`);
    });
  });
}

download('script.js');
download('SPEC.md');
