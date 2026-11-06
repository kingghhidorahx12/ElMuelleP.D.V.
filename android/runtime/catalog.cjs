const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function readCatalog(app){
 const plain=fs.readFileSync(path.join(app,'initial-catalog/products.json'));
 const manifest=JSON.parse(fs.readFileSync(path.join(app,'../bundle-manifest.json'),'utf8'));
 const expected=manifest.files?.['app/initial-catalog/products.json'];
 if(!/^[a-f0-9]{64}$/.test(expected||'')||crypto.createHash('sha256').update(plain).digest('hex')!==expected)throw Error('Catálogo inicial alterado');
 const products=JSON.parse(plain);if(products.length!==28||products.some(p=>p.stockQuantity!==0))throw Error('Catálogo inicial inválido');return products;
}
module.exports={readCatalog};
