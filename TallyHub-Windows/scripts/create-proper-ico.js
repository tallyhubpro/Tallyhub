const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function createProperIco() {
    console.log('🎨 Creating Windows-compatible ICO with UWP naming convention...');
    
    const assetsDir = path.join(__dirname, '../assets');
    const sourceIcon = path.join(assetsDir, 'icon.png');
    const outputIcon = path.join(assetsDir, 'icon.ico');
    
    if (!fs.existsSync(sourceIcon)) {
        console.error('❌ Source icon PNG not found:', sourceIcon);
        return;
    }
    
    try {
        // Create multiple PNG sizes for the ICO and UWP naming
        const sizes = [
            { size: 16, name: 'Square44x44Logo.targetsize-16_altform-unplated.png' },
            { size: 24, name: 'Square44x44Logo.targetsize-24_altform-unplated.png' },
            { size: 32, name: 'Square44x44Logo.targetsize-32_altform-unplated.png' },
            { size: 44, name: 'Square44x44Logo.png' },
            { size: 48, name: 'Square44x44Logo.targetsize-48_altform-unplated.png' },
            { size: 64, name: 'Square44x44Logo.targetsize-64_altform-unplated.png' },
            { size: 88, name: 'Square44x44Logo.scale-200.png' },
            { size: 128, name: 'Square44x44Logo.targetsize-128_altform-unplated.png' },
            { size: 256, name: 'Square44x44Logo.targetsize-256_altform-unplated.png' }
        ];
        
        const pngBuffers = [];
        
        console.log('📐 Generating UWP-compatible icon sizes...');
        for (const { size, name } of sizes) {
            console.log(`   Creating ${size}x${size} (${name})...`);
            const buffer = await sharp(sourceIcon)
                .resize(size, size, {
                    kernel: sharp.kernel.lanczos3,
                    fit: 'cover',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer();
            
            // Save individual PNG files with UWP naming
            const pngPath = path.join(assetsDir, name);
            fs.writeFileSync(pngPath, buffer);
            
            pngBuffers.push(buffer);
        }
        
        // Now use png-to-ico with the multiple sizes
        const pngToIco = require('png-to-ico');
        console.log('🔧 Converting to ICO format...');
        const icoBuffer = await pngToIco(pngBuffers);
        
        fs.writeFileSync(outputIcon, icoBuffer);
        
        const stats = fs.statSync(outputIcon);
        console.log(`✅ Created optimized icon.ico (${Math.round(stats.size / 1024)}KB)`);
        console.log(`📏 Contains ${sizes.length} sizes with UWP naming convention`);
        console.log('🎯 Individual PNG files created for electron-builder compatibility');
        
    } catch (error) {
        console.error('❌ Error creating ICO:', error.message);
        process.exit(1);
    }
}

createProperIco();
