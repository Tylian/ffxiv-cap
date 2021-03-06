const zlib = require('zlib');
const FFXIV_HEADER = Buffer.from('5252a041ff5d46e27f2a644d7b99c475', 'hex');

module.exports = {
    parsePacket(buffer) {
        return {
            opcode: buffer.readUInt16LE(2),
            server: buffer.readUInt16LE(6),
            timestamp: buffer.readUInt16LE(8),
            data: buffer.slice(16)
        };
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
    parseContainer(buffer) {
        if(buffer.length < 28 || FFXIV_HEADER.compare(buffer, 0, FFXIV_HEADER.length) != 0) {
            if(buffer.includes(FFXIV_HEADER)) console.log('FFXIV packet found in header, but dropped cause fragmented');
            return null;
        }

        let container = {
            magic: buffer.slice(0, 16),
            timestamp: buffer.slice(16, 24),
            size: buffer.readUInt32LE(24),
            connectionType: buffer.readUInt16LE(28),
            count: buffer.readUInt16LE(30),
            compressed: buffer.readUInt8(33),
        }

        if(buffer.length < container.size) {
            console.log('Dropping fragmented packet');
            return null;
        }

        container.segments = buffer.slice(40, container.size);
    
        if(container.compressed == 1) {
            container.segments = zlib.inflateSync(container.segments);
        }
    
        var segments = []; let offset = 0;
        for(var i = 0; i < container.count; i++) {
            let segment = this.parseSegment(container.segments.slice(offset));
            if(segment.type == 3) {
                Object.assign(segment, this.parsePacket(segment.data));
            }
            offset += segment.size;
            segments.push(segment);
        }
    
        container.segments = segments;
        return container;
    }
};