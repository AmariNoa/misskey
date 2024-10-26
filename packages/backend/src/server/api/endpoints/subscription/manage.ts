import { Stripe } from 'stripe';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { MetaService } from '@/core/MetaService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['subscription'],

	requireCredential: true,
	kind: 'read:account',

	errors: {
		unavailable: {
			message: 'Subscription unavailable.',
			code: 'UNAVAILABLE',
			id: 'ca50e7c1-2589-4360-a338-e729100af0c4',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '6a27f458-92aa-4807-bbc3-3b8223a84a7e',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.metaService.fetch(true);
			if (!instance.enableSubscriptions) {
				throw new ApiError(meta.errors.unavailable);
			}
			if (!(this.config.stripe && this.config.stripe.secretKey && this.config.stripe.customerPortalUrl)) {
				throw new ApiError(meta.errors.unavailable);
			}

			const user = await this.usersRepository.findOneBy( { id: me.id });
			const userProfile = await this.userProfilesRepository.findOneBy({ userId: me.id });
			if (!this.config.stripe.secretKey || !user || !userProfile || !userProfile.stripeCustomerId || !userProfile.twoFactorEnabled) {
				return {
					redirect: {
						permanent: false,
						destination: config.stripe?.customerPortalUrl,
					},
				};
			}

			if (user.subscriptionStatus === 'none') {
				throw new ApiError(meta.errors.noSuchUser);
			}

			const stripe = new Stripe(this.config.stripe.secretKey);
			const session = await stripe.billingPortal.sessions.create({
				customer: userProfile.stripeCustomerId,
				return_url: `${this.config.url}/settings/subscription`,
			});

			return {
				redirect: {
					permanent: false,
					destination: session.url,
				},
			};
		});
	}
}
