const sprintf = require('printf');
const EXD = require('./lib/EXD');
const Capture = require('./lib/Capture');
const FFXIV = require('./lib/FFXIV');

const LOG_TRAFFIC = true;
const LOG_ABILITIES = false;

let EffectType = ["none", "damage", "healing", "addStatus", "resistStatus", "unaffectStatus", "gainGauge", "gainTP", "gainMP", "enmity", "gainGP"];
EffectType.forEach((e,i) => { EffectType[e] = i });

function printf(format, ...argv) {
	console.log(sprintf(format, ...argv));
}

console.log('Precaching EXDs...');
EXD.getCache('action');
EXD.getCache('status');

const cap = new Capture('192.168.0.179', 55027);
cap.on('incoming', data => {
	let packet = FFXIV.parseContainer(data);
	if(packet == undefined) return;
	for(let segment of packet.segments) {
		if(segment.type != 3) continue;
		LOG_TRAFFIC && printf('<- 0x%04x %s', segment.opcode, segment.data.toString("hex"));
		switch(segment.opcode) {
			case 0x00f1: // SingleAbility
				LOG_ABILITIES && printf('SingleAbility %s', segment.data.toString("hex"));
				var result = parseAbility(segment, segment.data);
				handleAbility([result])
				break;
			case 0x00f4: // AreaAbility
				LOG_ABILITIES && printf('AreaAbility %s', segment.data.toString("hex"));
				var result = parseAreaAbility(segment, segment.data);
				handleAbility(result)
				break;
		}
		
	}
});
cap.on('outgoing', data => {
	let packet = FFXIV.parseContainer(data);
	if(packet == undefined) return;
	for(let segment of packet.segments) {
		if(segment.type != 3) continue;
		LOG_TRAFFIC && printf('-> 0x%04x %s', segment.opcode, segment.data.toString("hex"));
		switch(segment.opcode) {
			default:
				// noop
		}
	}
});

console.log("Ready!");

// ----------------------------------------------------------------------------

function handleAbility(results) {
	results.forEach(result => {
		printf('-- %s @ 0x%08x --', EXD.getValue('action', result.action), result.target, result.actor);

		result.effects.forEach((effect, idx) => {
			let type = effect.data1 & 0xff;
			let value = effect.data2 & 0xffff;
			let effectType = EffectType.none;

			switch(type) {
				case 1: // 0 damage = miss
				case 3:
				case 5: // block
				case 6: // Parry
					effectType = EffectType.damage; break;
				case 4:
					effectType = EffectType.healing; break
				case 8: // no effect
					break;
				case 11:
					effectType = EffectType.gainMP; break;
				case 13:
					effectType = EffectType.gainTP; break;
				case 14:
					effectType = EffectType.gainGP; break;
				case 15:
				case 16:
					effectType = EffectType.addStatus; break;
				case 21:
					effectType = EffectType.unaffectStatus; break;
				case 26:
					effectType = EffectType.enmity; break;
				case 28: // play animation (?) [data2 = skill id & 0xFFFF]
					break;
				case 51:
					effectType = EffectType.resistStatus; break;
				case 58: // Gauge update
					effectType = EffectType.gainGauge; break;
			}

			switch(effectType) {
				case EffectType.damage:
				case EffectType.healing:
					if((effect.data2 & 0x4000000) != 0)
						value *= 10;
					
					let shr = effectType != EffectType.healing ? 8 : 16;
					let critical = (effect.data1 >>> shr & 0x1) != 0;
					let direct = (effect.data1 >>> shr & 0x2) != 0;

					if(value == 0 && type == 1) {
						printf("The attack misses!");
						break;
					}

					let critmsg = '';
					if(type == 6)
						critmsg += " (Parried!)";
					else if(type == 5)
						critmsg += " (Blocked!)";
					else if(critical && direct)
						critmsg =` (Critical direct hit!!)`;
					else if (critical || direct)
						critmsg =`  (${critical ? "Critical" : "Direct"} hit!)`;

					let bonusPercent = effect.data1 >> 24 & 0xFF;
					
					printf("%s %d damage%s (+%d%%)", effectType == EffectType.damage ? "Dealt" : "Healed", value, critmsg, bonusPercent);
					break;
				case EffectType.addStatus:
				case EffectType.resistStatus:
				case EffectType.unaffectStatus:
					const messages = {
						[EffectType.addStatus]: "Gained status: %s",
						[EffectType.resistStatus]: "Fully resists status: %s",
						[EffectType.unaffectStatus]: "Unaffected by status: %s",
					};
					let critRate = (effect.data1 >> 16 & 0xff) / 10;
					if(critRate < 5 && critRate > 0) critRate += 25.6;
					printf(messages[effectType] + (critRate > 0 ? " (Critical Rate: %.1f%%)" : ""), EXD.getValue('status', value), critRate);
					break;
				case EffectType.gainGauge:
					let gain1 = effect.data1 >> 8 & 0xFF;
					let gain2 = effect.data1 >> 16 & 0xFF;
					switch(value) {
						case 0xba: // Balance Gauge
						case 0xbb: // (Manafication??)
							printf("Gained %d black and %d white mana", gain2, gain1);
							break;
						case 0xb7: // Kenki
							printf("Gained %d kenki", gain1);
							break;
						case 0xb8: // Sen
							printf("Gained %s", gain1 == 1 ? "Setsu" : gain1 == 2 ? "Getsu" : "Ka");
							break;
						case 0xc9: // Huton
						case 0xd4: // Armor Crush
							break;
						case 0xaf: // Draw
						case 0xb2: // Redraw
						case 0xb3: // Minor Arcana
						case 0xb0: // Spread
							let cards = ["", "The Balance", "The Bole", "The Arrow", "The Spear", "The Ewer", "The Spire", "Lord of Crowns", "Lady of Crowns"];
							const drawMessage = {
								0xaf: "Draw: %s",
								0xb2: "Redraw: %s",
								0xb0: "Stored %s in Spread",
								0xb3: " Minor Arcana: %s",
							};

							printf(drawMessage[gaugeType], cards[gain1]);
							break;
						case 0xb4: // Sleeve Draw [no data :(]
						case 0xdf: // Undraw
						case 0xe1: // Unspread
						case 0xe0: // Empty Road
					}
					break;
				case EffectType.gainTP:
				case EffectType.gainMP:
					let stats = { [EffectType.gainMP]: "MP", [EffectType.gainTP]: "TP"} 
					printf("Gained %d %s", value, stats[effectType]);
					break;
			}
		});

		result.effects.forEach((effect, i) => {
			let type = effect.data1 & 0xff;
			if(effect.data1 != 0 || effect.data2 != 0) printf("[%d] %03d: 0x%08x 0x%08x", i, type, effect.data1, effect.data2);
		});
	});
}

function parseEffects(buffer) {
	let offset = 0;
	let effects = [];
	for(var i = 0; i < 8; i++) {
		effects.push({
			data1: buffer.readUInt32LE(offset),
			data2: buffer.readUInt32LE(offset + 4),
		});
		offset += 8;
	}

	return effects;
}

function parseAreaAbility(segment, data) {
	let results = [];
	let targets = data.readUInt16LE(18);

	for(var i = 0; i < targets; i++) {
		let result = {
			source: segment.source,
			action: data.readUInt16LE(8),
			effects: data.slice(40 + 64 * i, 104 + 64 * i),
			target:  data.readUInt32LE(552 + i * 8)
		};

		result.effects = parseEffects(result.effects);
		results.push(result);
	}
	
	return results;
}

function parseAbility(segment, data) {
	let result = {
		source: segment.source,
		action: data.readUInt16LE(8),
		effects: data.slice(40, 106),
		target: data.readUInt32LE(106),
	};

	result.effects = parseEffects(result.effects);
	return result;
}