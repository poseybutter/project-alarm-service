const sharp = require("sharp");
const fs = require("fs");

const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <rect width="600" height="600" rx="120" fill="#ff6600"/>
  <text x="300" y="390" text-anchor="middle"
    font-size="230" font-weight="700" fill="white"
    font-family="Arial, sans-serif">UD</text>
</svg>
`;

async function generateIcons() {
    if (!fs.existsSync("public/icons")) {
        fs.mkdirSync("public/icons", { recursive: true });
    }

    await sharp(Buffer.from(svgContent))
        .resize(192, 192)
        .png()
        .toFile("public/icons/icon-192.png");

    await sharp(Buffer.from(svgContent))
        .resize(512, 512)
        .png()
        .toFile("public/icons/icon-512.png");

    console.log("아이콘 생성 완료!");
}

generateIcons().catch(console.error);
