import { CommandStore, KlasaMessage } from 'klasa';
import { Hiscores } from 'oldschooljs';

import { BotCommand } from '../../lib/structures/BotCommand';

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			aliases: ['vs'],
			description: 'Shows the virtual stats of a OSRS account',
			usage: '(username:rsn)',
			requiredPermissionsForBot: ['EMBED_LINKS'],
			examples: ['+vs Magnaboy'],
			categoryFlags: ['utility']
		});
	}

	async run(msg: KlasaMessage, [username]: [string]) {
		try {
			const player = await Hiscores.fetch(username, { virtualLevels: true });
			return msg.channel.send({ embeds: [this.getStatsEmbed(username, 7_981_338, player, 'level', false)] });
		} catch (err: any) {
			return msg.channel.send(err.message);
		}
	}
}
