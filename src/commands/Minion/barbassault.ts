import { calcWhatPercent, increaseNumByPercent, randArrItem, reduceNumByPercent, round, Time } from 'e';
import { CommandStore, KlasaMessage } from 'klasa';
import { Bank } from 'oldschooljs';
import { addArrayOfNumbers } from 'oldschooljs/dist/util';

import { Emoji, Events } from '../../lib/constants';
import { maxOtherStats } from '../../lib/gear';
import { minionNotBusy, requiresMinion } from '../../lib/minions/decorators';
import { countUsersWithItemInCl } from '../../lib/settings/prisma';
import { getMinigameScore } from '../../lib/settings/settings';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import { HighGambleTable, LowGambleTable, MediumGambleTable } from '../../lib/simulation/baGamble';
import { BotCommand } from '../../lib/structures/BotCommand';
import { MakePartyOptions } from '../../lib/types';
import { BarbarianAssaultActivityTaskOptions } from '../../lib/types/minions';
import { formatDuration, randomVariation, stringMatches } from '../../lib/util';
import addSubTaskToActivityTask from '../../lib/util/addSubTaskToActivityTask';
import { formatOrdinal } from '../../lib/util/formatOrdinal';
import getOSItem from '../../lib/util/getOSItem';
import itemID from '../../lib/util/itemID';

const BarbBuyables = [
	{
		item: getOSItem('Fighter hat'),
		cost: 275 * 4
	},
	{
		item: getOSItem('Ranger hat'),
		cost: 275 * 4
	},
	{
		item: getOSItem('Healer hat'),
		cost: 275 * 4
	},
	{
		item: getOSItem('Runner hat'),
		cost: 275 * 4
	},
	{
		item: getOSItem('Fighter torso'),
		cost: 375 * 4
	},
	{
		item: getOSItem('Penance skirt'),
		cost: 375 * 4
	},
	{
		item: getOSItem('Runner boots'),
		cost: 100 * 4
	},
	{
		item: getOSItem('Penance gloves'),
		cost: 150 * 4
	}
];

const levels = [
	{
		level: 2,
		cost: 200 * 4
	},
	{
		level: 3,
		cost: 300 * 4
	},
	{
		level: 4,
		cost: 400 * 4
	},
	{
		level: 5,
		cost: 500 * 4
	}
];

const GambleTiers = [
	{
		name: 'Low',
		cost: 200,
		table: LowGambleTable
	},
	{
		name: 'Medium',
		cost: 400,
		table: MediumGambleTable
	},
	{
		name: 'High',
		cost: 500,
		table: HighGambleTable
	}
];

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			altProtection: true,
			categoryFlags: ['minion', 'pvm', 'minigame'],
			description: 'Sends your minion to do barbarian assault, or buy rewards and gamble.',
			examples: ['+barbassault [start]'],
			subcommands: true,
			usage: '[start|level|buy|gamble] [qty:int{1}] [buyableOrGamble:...string]',
			usageDelim: ' ',
			aliases: ['ba']
		});
	}

	@requiresMinion
	async run(msg: KlasaMessage) {
		return msg.channel.send(
			`**Honour Points:** ${msg.author.settings.get(
				UserSettings.HonourPoints
			)} **Honour Level:** ${msg.author.settings.get(
				UserSettings.HonourLevel
			)} **High Gambles:** ${msg.author.settings.get(UserSettings.HighGambles)}\n\n` +
				`You can start a Barbarian Assault party using \`${msg.cmdPrefix}ba start\`, you'll need 2+ people to join to start.` +
				' We have a BA channel in our server for finding teams: (discord.gg/ob). \n' +
				"Barbarian Assault works differently in the bot than ingame, there's only 1 role, no waves, and 1 balance of honour points." +
				`\n\nYou can buy rewards with \`${msg.cmdPrefix}ba buy\`, level up your Honour Level with \`${msg.cmdPrefix}ba level\`.` +
				` You can gamble using \`${msg.cmdPrefix}ba gamble high/medium/low\`.`
		);
	}

	async level(msg: KlasaMessage) {
		const currentLevel = msg.author.settings.get(UserSettings.HonourLevel);
		if (currentLevel === 5) {
			return msg.channel.send("You've already reached the highest possible Honour level.");
		}

		const points = msg.author.settings.get(UserSettings.HonourPoints);

		for (const level of levels) {
			if (currentLevel >= level.level) continue;
			if (points < level.cost) {
				return msg.channel.send(
					`You don't have enough points to upgrade to level ${level.level}. You need ${level.cost} points.`
				);
			}
			await msg.author.settings.update(UserSettings.HonourPoints, points - level.cost);
			await msg.author.settings.update(UserSettings.HonourLevel, currentLevel + 1);
			return msg.channel.send(
				`You've spent ${level.cost} Honour points to level up to Honour level ${level.level}!`
			);
		}
	}

	async buy(msg: KlasaMessage, [qty = 1, input = '']: [number, string]) {
		const buyable = BarbBuyables.find(i => stringMatches(input, i.item.name));
		if (!buyable) {
			return msg.channel.send(
				`Here are the items you can buy: \n\n${BarbBuyables.map(
					i => `**${i.item.name}:** ${i.cost} points`
				).join('\n')}.`
			);
		}

		const { item, cost } = buyable;
		const balance = msg.author.settings.get(UserSettings.HonourPoints);
		if (balance < cost * qty) {
			return msg.channel.send(
				`You don't have enough Honour Points to buy ${qty.toLocaleString()}x ${item.name}. You need ${(
					cost * qty
				).toLocaleString()}, but you have only ${balance.toLocaleString()}.`
			);
		}
		await msg.confirm(
			`Are you sure you want to buy ${qty.toLocaleString()}x ${item.name}, for ${(
				cost * qty
			).toLocaleString()} honour points?`
		);
		await msg.author.settings.update(UserSettings.HonourPoints, balance - cost * qty);
		await msg.author.addItemsToBank({ items: { [item.id]: qty }, collectionLog: true });

		return msg.channel.send(
			`Successfully purchased ${qty.toLocaleString()}x ${item.name} for ${(
				cost * qty
			).toLocaleString()} Honour Points.`
		);
	}

	async gamble(msg: KlasaMessage, [qty = 1, tier = '']: [number, string]) {
		const buyable = GambleTiers.find(i => stringMatches(tier, i.name));
		if (!buyable) {
			return msg.channel.send(
				`You can gamble your points for the Low, Medium and High tiers. For example, \`${msg.cmdPrefix}ba gamble low\`.`
			);
		}
		const balance = msg.author.settings.get(UserSettings.HonourPoints);
		const { cost, name, table } = buyable;
		if (balance < cost * qty) {
			return msg.channel.send(
				`You don't have enough Honour Points to do ${qty.toLocaleString()}x ${name} gamble. You need ${(
					cost * qty
				).toLocaleString()}, but you have only ${balance.toLocaleString()}.`
			);
		}
		await msg.confirm(
			`Are you sure you want to do ${qty.toLocaleString()}x ${name} gamble, using ${(
				cost * qty
			).toLocaleString()} honour points?`
		);
		await msg.author.settings.update(UserSettings.HonourPoints, balance - cost * qty);
		const loot = new Bank().add(table.roll(qty));
		if (loot.has('Pet penance queen')) {
			const gamblesDone = msg.author.settings.get(UserSettings.HighGambles) + 1;

			const amount = await countUsersWithItemInCl(itemID('Pet penance queen'), false);

			this.client.emit(
				Events.ServerNotification,
				`<:Pet_penance_queen:324127377649303553> **${msg.author.username}'s** minion, ${
					msg.author.minionName
				}, just received a Pet penance queen from their ${formatOrdinal(
					gamblesDone
				)} High gamble! They are the ${formatOrdinal(amount + 1)} to it.`
			);
		}
		const { itemsAdded } = await msg.author.addItemsToBank({ items: loot, collectionLog: true });
		await msg.author.settings.update(
			UserSettings.HighGambles,
			msg.author.settings.get(UserSettings.HighGambles) + qty
		);
		return msg.channel.send(
			`You spent ${(
				cost * qty
			).toLocaleString()} Honour Points for ${qty.toLocaleString()}x ${name} Gamble, and received... ${itemsAdded}.`
		);
	}

	@minionNotBusy
	@requiresMinion
	async start(msg: KlasaMessage, [qty = 0, input]: [number, string]) {
		const partyOptions: MakePartyOptions = {
			leader: msg.author,
			minSize: 1,
			maxSize: 4,
			ironmanAllowed: true,
			message: `${msg.author.username} has created a Barbarian Assault party${
				qty > 0 ? ` for a maximum of ${qty} wave${qty > 1 ? 's' : ''}` : ''
			}! Anyone can click the ${
				Emoji.Join
			} reaction to join, click it again to leave. There must be 2+ users in the party.`,
			customDenier: async user => {
				if (!user.hasMinion) {
					return [true, "you don't have a minion."];
				}
				if (user.minionIsBusy) {
					return [true, 'your minion is busy.'];
				}

				return [false];
			}
		};

		const users = input === 'solo' ? [msg.author] : await msg.makePartyAwaiter(partyOptions);

		let totalLevel = 0;
		for (const user of users) {
			totalLevel += user.settings.get(UserSettings.HonourLevel);
		}

		const boosts = [];

		let waveTime = randomVariation(Time.Minute * 4, 10);

		// Up to 12.5% speed boost for max strength
		const fighter = randArrItem(users);
		const gearStats = fighter.getGear('melee').stats;
		const strengthPercent = round(calcWhatPercent(gearStats.melee_strength, maxOtherStats.melee_strength) / 8, 2);
		waveTime = reduceNumByPercent(waveTime, strengthPercent);
		boosts.push(`${strengthPercent}% for ${fighter.username}'s melee gear`);

		// Up to 30% speed boost for team total honour level
		const totalLevelPercent = round(calcWhatPercent(totalLevel, 5 * users.length) / 3.3, 2);
		boosts.push(`${totalLevelPercent}% for team honour levels`);
		waveTime = reduceNumByPercent(waveTime, totalLevelPercent);

		if (users.length === 1) {
			waveTime = increaseNumByPercent(waveTime, 10);
			boosts.push('10% slower for solo');
		}
		// Up to 10%, at 200 kc, speed boost for team average kc
		const averageKC =
			addArrayOfNumbers(await Promise.all(users.map(u => getMinigameScore(u.id, 'barb_assault')))) / users.length;
		const kcPercent = round(Math.min(100, calcWhatPercent(averageKC, 200)) / 5, 2);
		boosts.push(`${kcPercent}% for average KC`);
		waveTime = reduceNumByPercent(waveTime, kcPercent);

		let quantity = Math.floor(msg.author.maxTripLength('BarbarianAssault') / waveTime);
		if (qty > 0 && quantity > qty) quantity = qty;
		const duration = quantity * waveTime;

		boosts.push(`Each wave takes ${formatDuration(waveTime)}`);

		let str = `${partyOptions.leader.username}'s party (${users
			.map(u => u.username)
			.join(', ')}) is now off to do ${quantity} waves of Barbarian Assault. Each wave takes ${formatDuration(
			waveTime
		)} - the total trip will take ${formatDuration(duration)}. `;

		str += `The Fighter is ${fighter.username}'s minion, their melee gear strength bonus is giving a ${strengthPercent}% boost.`;
		str += `\n\n**Boosts:** ${boosts.join(', ')}.`;
		await addSubTaskToActivityTask<BarbarianAssaultActivityTaskOptions>({
			userID: msg.author.id,
			channelID: msg.channel.id,
			quantity,
			duration,
			type: 'BarbarianAssault',
			leader: msg.author.id,
			users: users.map(u => u.id),
			minigameID: 'barb_assault',
			totalLevel
		});

		return msg.channel.send(str);
	}
}
