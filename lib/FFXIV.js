const zlib = require('zlib');
const ffxivHeader = Buffer.from('5252a041ff5d46e27f2a644d7b99c475', 'hex');

module.exports = {
    parseSegment(buffer) {
        let segment =  {
            size: buffer.readUInt32LE(0),
            actor: buffer.readUInt32LE(4),
            type: buffer.readUInt32LE(16),
        };
        segment.data = buffer.slice(32, segment.size);
        return segment;
    },
    async parsePacket(buffer) {
        if(buffer.length < 28 || ffxivHeader.compare(buffer, 0, ffxivHeader.length) != 0) return;
    
        let data = {
            magic: buffer.slice(0, 16),
            timestamp: buffer.slice(16, 24),
            size: buffer.readUInt32LE(24),
            connectionType: buffer.readUInt16LE(28),
            count: buffer.readUInt16LE(30),
            compressed: buffer.readUInt16LE(32),
        }
        data.segments = buffer.slice(40, data.size);
    
        if(data.compressed > 1) {
            data.segments = zlib.inflateRawSync(data.segments.slice(2));
        }
    
        var segments = []; let offset = 0;
        for(var i = 0; i < data.count; i++) {
            let segment = this.parseSegment(data.segments.slice(offset));
            offset += segment.size;
            segments.push(segment);
        }
    
        data.segments = segments;
        return data;
    }
};