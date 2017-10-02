const EventEmitter = require('events');
const Cap = require('cap').Cap,
  decoders = require('cap').decoders,
  PROTOCOL = decoders.PROTOCOL;

class Capture extends EventEmitter {
    constructor(ip, port) {
        super();
        
        const c = new Cap();
        const device = Cap.findDevice(ip);
        const bufSize = 10 * 1024 * 1024;
        const buffer = new Buffer(65535);

        const linkType = c.open(device, 'tcp and port ' + port, bufSize, buffer);
        c.setMinBytes && c.setMinBytes(0);

        c.on('packet', (nbytes, trunc) => {
            if (linkType === 'ETHERNET') {
                var ret = decoders.Ethernet(buffer);
                if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
                    ret = decoders.IPV4(buffer, ret.offset);
                    if (ret.info.protocol === PROTOCOL.IP.TCP) {
                        var datalen = ret.info.totallen - ret.hdrlen;
                        ret = decoders.TCP(buffer, ret.offset);
                        datalen -= ret.hdrlen;
            
                        let dataBuffer = buffer.slice(ret.offset, ret.offset + datalen);
                        if(ret.info.srcport == port) {
                            this.emit('incoming', dataBuffer);
                        } else if(ret.info.dstport == port) {
                            this.emit('outgoing', dataBuffer);
                        }
                    }
                }
            }
        });
    }
}

module.exports = Capture;