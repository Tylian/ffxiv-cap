const EventEmitter = require('events');
const Cap = require('cap').Cap,
    decoders = require('cap').decoders,
    PROTOCOL = decoders.PROTOCOL;

class Capture extends EventEmitter {
    constructor(ip, port) {
        super();

        const c = new Cap();
        const device = ip != "" ? Cap.findDevice(ip) : Cap.deviceList()[0].name;
        const bufSize = 10 * 1024 * 1024;
        const buffer = new Buffer(65535);

        if(device == "") {
            throw new Error("Supplied capture device not found.");
        }

        const linkType = c.open(device, 'ip and tcp', bufSize, buffer);
        c.setMinBytes && c.setMinBytes(0);

        // we only wanna listen to ethernet traffic
        if(linkType !== 'ETHERNET')
            return;

        c.on('packet', (nbytes, trunc) => {
            var eth = decoders.Ethernet(buffer);
            if(eth.info.type === PROTOCOL.ETHERNET.IPV4) {
                var ip = decoders.IPV4(buffer, eth.offset);
                if(ip.info.protocol === PROTOCOL.IP.TCP) {
                    var datalen = ip.info.totallen - ip.hdrlen;
                    var tcp = decoders.TCP(buffer, ip.offset);
                    datalen -= tcp.hdrlen;

                    let dataBuffer = buffer.slice(tcp.offset, tcp.offset + datalen);
                    if(tcp.info.srcport >= port[0] && tcp.info.srcport <= port[1]) {
                        this.emit('incoming', dataBuffer);
                    } else if(tcp.info.dstport >= port[0] && tcp.info.dstport <= port[1]) {
                        this.emit('outgoing', dataBuffer);
                    }
                }
            }
        });
    }
}

module.exports = Capture;