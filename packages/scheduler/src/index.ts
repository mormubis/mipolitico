import { CronJob as Job, CronTime as Time } from 'cron';
import { Errors, type ServiceSchema } from 'moleculer';
import pLimit from 'p-limit';

type SchedulerOptions = {
  concurrency: number;
  schedule: string;
  timezone: string;
};

const NO_AUTOSTART = false;
const noop = () => {};

const mixin = {
  async created() {
    const { logger, settings } = this;
    const { concurrency = 1, schedule, timezone }: SchedulerOptions = settings.scheduler ?? {};

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

  name: 'scheduler',

  methods: {
    onComplete() {},
    onTick() {},
  },

  settings: {
    scheduler: {
      concurrency: 1,
      timezone: '',
    },
  },

  started() {
    this.$job.start();
  },

  stopped() {
    this.$job.stop();
  },
} satisfies ServiceSchema;

export default mixin;
