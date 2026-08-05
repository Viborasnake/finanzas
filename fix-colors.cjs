const fs = require('fs');
const execSync = require('child_process').execSync;

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  content = content.replace(/solid black/g, 'solid var(--border-color)');
  content = content.replace(/solid #000/g, 'solid var(--border-color)');
  content = content.replace(/0px black/g, '0px var(--border-color)');
  content = content.replace(/0px #000/g, '0px var(--border-color)');
  content = content.replace(/color: 'black'/g, "color: 'var(--text-primary)'");
  content = content.replace(/color: black/g, "color: var(--text-primary)");
  content = content.replace(/backgroundColor: '#fff'/g, "backgroundColor: 'var(--surface-color)'");
  content = content.replace(/backgroundColor: white/g, "backgroundColor: var(--surface-color)");
  content = content.replace(/background-color: white/g, "background-color: var(--surface-color)");
  content = content.replace(/background-color: #fff/g, "background-color: var(--surface-color)");
  content = content.replace(/background: '#fff'/g, "background: 'var(--surface-color)'");
  content = content.replace(/background: #fff/g, "background: var(--surface-color)");
  content = content.replace(/background: black/g, "background: var(--border-color)");
  content = content.replace(/color: white/g, "color: var(--bg-color)");
  content = content.replace(/fill="#000"/g, 'fill="var(--border-color)"');
  content = content.replace(/color="#000"/g, 'color="var(--border-color)"');
  content = content.replace(/stroke="#000"/g, 'stroke="var(--border-color)"');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log('Updated', filePath);
  }
}

const files = execSync('find src -type f -name "*.tsx" -o -name "*.css"').toString().split('\n').filter(Boolean);
files.forEach(replaceInFile);
