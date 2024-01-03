import { CronJob as Job, CronTime as Time } from 'cron';
import { Errors } from 'moleculer';

import type { ServiceSchema } from 'moleculer';

const NO_AUTOSTART = false;
const noop = () => {};

const mixin: ServiceSchema = {
  async created() {
    const pLimit = (await import('p-limit')).default;

    const { logger } = this;
    const { concurrency = 1, schedule, timezone } = this.settings ?? {};

    if (!schedule) {
      throw new Errors.ServiceSchemaError(
        `[Scheduler]: 'schedule' is not defined. Define 'settings.schedule' in your service.`,
        schedule,
      );
    }

    try {
      new Time(schedule);

      const context = this;
      const limit = pLimit(concurrency);

      const callback = this?.onTick ?? noop;
      const onTick = async (onComplete: () => void) => {
        await limit(callback);
        onComplete?.();
      };

      this.$job = new Job(schedule, onTick, this?.onComplete, NO_AUTOSTART, timezone, context);
    } catch (e) {
      logger.error(e);
      throw new Errors.ServiceSchemaError(
        `[Scheduler]: 'schedule' must be a valid cron time. Check https://crontab.guru/ for more info.`,
        schedule,
      );
    }
  },

  methods: {
    onComplete() {},
    onTick() {},
  },

  name: 'scheduler',

  settings: {
    concurrency: 1,
    timezone: '',
  },

  started() {
    if (this.$job) {
      this.$job.start();
    }
  },

  stopped() {
    if (this.$job) {
      this.$job.stop();
    }
  },
};

export default mixin;
