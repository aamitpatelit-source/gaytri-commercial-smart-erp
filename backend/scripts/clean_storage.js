const fs = require('fs');
const path = require('path');

function cleanStorage() {
  console.log('[Storage Cleanup] Checking for temporary or orphaned upload directories...');
  
  const possiblePaths = [
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../public/uploads'),
    path.join(__dirname, '../temp'),
    path.join(__dirname, '../../web_admin/public/uploads')
  ];

  let cleanedFilesCount = 0;

  for (const dirPath of possiblePaths) {
    if (fs.existsSync(dirPath)) {
      console.log(`[Storage Cleanup] Inspecting directory: ${dirPath}`);
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file !== '.gitkeep' && file !== 'README.md') {
          const fullPath = path.join(dirPath, file);
          if (fs.lstatSync(fullPath).isFile()) {
            fs.unlinkSync(fullPath);
            cleanedFilesCount++;
            console.log(`  ✔ Deleted file: ${file}`);
          }
        }
      }
    }
  }

  console.log(`[Storage Cleanup] Cleanup complete. Removed ${cleanedFilesCount} orphaned files.`);
}

cleanStorage();
