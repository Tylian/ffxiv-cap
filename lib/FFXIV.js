const zlib = require('zlib');
const ffxivHeader = Buffer.from('5252a041ff5d46e27f2a644d7b99c475', 'hex');

module.exports = {
    parsePacket(buffer) {
        let packet = {
            opcode: buffer.readUInt16LE(2),
            server: buffer.readUInt16LE(6),
            timestamp: buffer.readUInt16LE(8),
            data: buffer.slice(16)
        }

        return packet;
    },
    parseSegment(buffer) {
        let segment =  {
            size: buffer.readUInt32LE(0),
            source: buffer.readUInt32LE(4),
            target: buffer.readUInt32LE(8),
            type: buffer.readUInt16LE(12),
        };
        segment.data = buffer.slice(16, segment.size);
        return segment;
    },
    parsePacket(buffer) {
        if(buffer.length < 28 || ffxivHeader.compare(buffer, 0, ffxivHeader.length) != 0) return;
    
        let data = {
            magic: buffer.slice(0, 16),
            timestamp: buffer.slice(16, 24),
            size: buffer.readUInt32LE(24),
            connectionType: buffer.readUInt16LE(28),
            count: buffer.readUInt16LE(30),
            compressed: buffer.readUInt8(33),
        }
        data.segments = buffer.slice(40, data.size);
    
        if(data.compressed == 1) {
            data.segments = zlib.inflateSync(data.segments);
        }
    
        var segments = []; let offset = 0;
        for(var i = 0; i < data.count; i++) {
            let segment = this.parseSegment(data.segments.slice(offset));
            if(segment.type == 3) {
                Object.assign(segment, this.parsePacket(segment.data));
            }
            offset += segment.size;
            segments.push(segment);
        }
    
        data.segments = segments;
        return data;
    }
};