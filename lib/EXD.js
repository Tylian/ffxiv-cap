const path = require('path');
const fs = require('fs');
const parse = require('csv-parse/lib/sync');

const CACHE = {};

module.exports = {
    getValue(name, key, col = 1) {
        let records = this.getCache(name);
        let result = records.find(item => item[0] == key);
        return result != undefined ? result[col] : undefined;
    },
    getCache(name) {
        if(!CACHE[name]) {
            const jsonPath = path.join(process.cwd(), 'exd', `${name}.exh_en.json`);
            const csvPath = path.join(process.cwd(), 'exd', `${name}.exh_en.csv`);
            
            if(fs.existsSync(jsonPath)) {
                let text = fs.readFileSync(jsonPath);
                return CACHE[name] = JSON.parse(text);
            } else if(fs.existsSync(csvPath)) {
                let text = fs.readFileSync(csvPath);
                CACHE[name] = parse(text, {
                    auto_parse: true
                });

                fs.writeFileSync(jsonPath, JSON.stringify(CACHE[name]));

                return CACHE[name];
            }
            throw new Error(`${name}.exh_en.csv does not exist, please extract it!`);
        } else {
            return CACHE[name];
        }
    }
};