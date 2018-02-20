const sprintf = require('printf');
const EXD = require('./lib/EXD');
const Capture = require('./lib/Capture');
const FFXIV = require('./lib/FFXIV');

const LOG_TRAFFIC = false;
const LOG_ABILITIES = false;
const LOG_GAUGE = false;

const OP_ABILITY_1   = 0x0128;
const OP_ABILITY_8   = 0x012b;
const OP_ABILITY_16  = 0x0138;
const OP_ABILITY_24  = 0x0139;
const OP_ABILITY_32  = 0x013a;
const OP_ACTOR_GAUGE = 0x027d;

const CARDS = ["None", "The Balance", "The Bole", "The Arrow", "The Spear", "The Ewer", "The Spire", "Lord of Crowns", "Lady of Crowns"];
const ROYAL_ROAD = ["Empty", "Enhanced", "Extended", "Expanded"];

let EffectType = ["none", "damage", "healing", "addStatus", "resistStatus", "unaffectStatus", "gainGauge", "gainTP", "gainMP", "enmity", "gainGP"];
EffectType.forEach((e,i) => { EffectType[e] = i });

function printf(format, ...argv) {
	console.log(sprintf(format, ...argv));
}

console.log('Precaching EXDs...');
EXD.getCache('action');
EXD.getCache('status');
EXD.getCache('classjob');

function parseCStr(buffer) {
	return buffer.slice(0, buffer.indexOf(0)).toString('utf8');
}

const cap = new Capture(null, [55000, 55999]);
cap.on('incoming', data => {
	let packet = FFXIV.parseContainer(data);
	if(packet == undefined) return;
	for(let segment of packet.segments) {
		if(segment.type != 3) continue;
		LOG_TRAFFIC && printf('<- 0x%04x %s', segment.opcode, segment.data.toString("hex"));
		switch(segment.opcode) {
			case OP_ABILITY_1:
				LOG_ABILITIES && printf('Ability1 %s', segment.data.toString("hex"));
				var result = parseAbility(segment, segment.data);
				LOG_ABILITIES && handleAbility([result])
				break;
			case OP_ABILITY_8:
				LOG_ABILITIES && printf('Ability8 %s', segment.data.toString("hex"));
				var result = parseAreaAbility(segment, segment.data);
				LOG_ABILITIES && handleAbility(result)
				break;
			case OP_ACTOR_GAUGE:
				var result = parseGauge(segment, segment.data);
				LOG_GAUGE && handleGauge(result);
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

function handleGauge(result) {
	let job = EXD.getValue('classjob', result.job);
	let message = result.data.toString('hex');
	let gauge = result.gauge;

	printf("%s: %s", job, message)
	console.log(JSON.stringify(gauge, null, "  "));
}

function handleAbility(results) {
	results.forEach(result => {
		printf('-- %s @ 0x%08x --', EXD.getValue('action', result.action), result.target, result.actor);

		result.effects.forEach((effect, idx) => {
			let type = effect.data1 & 0xff;
			let value = effect.data2 >>> 16;
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
				case 59: // Gauge update
					effectType = EffectType.gainGauge; break;
			}

			switch(effectType) {
				case EffectType.damage:
				case EffectType.healing:
					value += 0xffff * effect.data2 & 0x0f;

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
					let gain1 = effect.data1 >> 8 & 0xff;
					let gain2 = effect.data1 >> 16 & 0xff;
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
							const drawMessage = {
								0xaf: "Draw: %s",
								0xb2: "Redraw: %s",
								0xb0: "Stored %s in Spread",
								0xb3: "Minor Arcana: %s",
							};

							printf(drawMessage[value], CARDS[gain1]);
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
		action: data.readUInt16LE(0x08),
		effects: data.slice(0x28, 0x6a),
		target: data.readUInt32LE(0x6a),
	};

	result.effects = parseEffects(result.effects);
	return result;
}

function parseGauge(segment, data) {
	let result = {
		job: data.readUInt8(0x00),
		data: data.slice(0x01),
	};

	let gauge = {};
	switch(result.job) {
		case 0x13: // paladin
			gauge.oath = data.readUInt8(0x01);
			break;
		case 0x14: // monk
			gauge.chakra = data.readUInt8(0x04);
			gauge.greasedLightning = data.readUInt8(0x03);
			gauge.duration = data.readUInt16LE(0x01) / 1000;
			break;
		case 0x15: // warrior
			gauge.beast = data.readUInt8(0x01);
			break;
		case 0x16: // dragoon
			gauge.dragon = data.readUInt8(0x03);
			gauge.gaze = data.readUInt8(0x04);
			gauge.duration = data.readUInt16LE(0x01) / 1000;
			break;
		case 0x17: // bard
			gauge.song = data.readUInt8(0x04) & 0x03;
			gauge.lastSong = (data.readUInt8(0x04) >>> 2) & 0x03;
			gauge.stacks = data.readUInt8(0x03);
			break;
		case 0x18: // white mage
			break;
		case 0x19: // black mage
			gauge.stacks = data.readInt8(0x05);
			gauge.enochian = data.readUInt8(0x07) == 0x01;
			gauge.umbralHeart = data.readUInt8(0x06);
			gauge.duration = data.readUInt16LE(0x03) / 1000;
			break;
		case 0x1a: // arcanist?
			break;
		case 0x1b: // summoner
			gauge.aetherflow = data.readUInt8(0x05) & 0x03;
			gauge.aethertrail = (data.readUInt8(0x05) >> 2) & 0x03;
			gauge.dreadwyrmAether = (data.readUInt8(0x05) >> 4) & 0x03;
			// todo: gauge.dreadwyrmTrace = ???
			gauge.bahamut = data.readUInt8(0x03) == 0x05;
			gauge.duration = data.readUInt16LE(0x01) / 1000;
			break;
		case 0x1c: // scholar
			gauge.aetherflow = data.readUInt8(0x05) & 0x03;
			guage.fairy = data.readUInt8(0x06);
			break;
		case 0x1d: // rogue?
			break;
		case 0x1e: // ninja
			gauge.huton = data.readUInt32LE(0x01);
			break;
		case 0x1f: // machinist
			break;
		case 0x20: // dark knight
			break;
		case 0x21: // astrologian
			gauge.drawn = data.readUInt8(0x05) & 0xf;
			gauge.held = data.readUInt8(0x05) >>> 4 & 0xf;
			gauge.royalRoad = data.readUInt8(0x06) >>> 4 & 0xf;
			gauge.minorArcana = data.readUInt8(0x06) & 0xf;
			break;
		case 0x22: // samurai
			let sen = data.readUInt8(0x02);
			gauge.kenki = data.readUInt8(0x01);
			gauge.setsu = (sen & 0x01) == 0x01;
			gauge.getsu = (sen & 0x02) == 0x02;
			gauge.ka = (sen & 0x04) == 0x04;
		case 0x23: // red mage
			gauge.blackMana = result.data[0];
			gauge.whiteMana = result.data[1];
			break;
	}

	result.gauge = gauge;
	return result;
}