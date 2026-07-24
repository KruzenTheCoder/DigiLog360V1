const https = require('https');
const fs = require('fs');

https.get('https://api.github.com/repos/ugommirikwe/sa-license-decoder/git/trees/master?recursive=1', {
  headers: {
    'User-Agent': 'Node.js'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const paths = json.tree.map(t => t.path);
    fs.writeFileSync('tree_paths.txt', paths.join('\n'));
    console.log('done');
  });
}).on('error', err => console.log(err));
