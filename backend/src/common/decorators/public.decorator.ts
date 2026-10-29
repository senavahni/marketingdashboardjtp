import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Menandai endpoint tanpa JWT (auth, health, webhook, agent API). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
