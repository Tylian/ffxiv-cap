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
            let file = path.join(process.cwd(), 'exd', `${name}.exh_en.csv`);
            let text = fs.readFileSync(file);
    
            return CACHE[name] = parse(text, {
                auto_parse: true
            });
        } else {
            return CACHE[name];
        }
    }
};