import { Injectable, Logger } from '@nestjs/common';
import { InfluxDB, Point } from '@influxdata/influxdb-client';

@Injectable()
export class InfluxService {
  private readonly logger = new Logger(InfluxService.name);
  private readonly bucket = process.env.INFLUX_BUCKET || 'sensors';
  private readonly org = process.env.INFLUX_ORG || 'sentry';
  private readonly client: InfluxDB;

  constructor() {
    this.client = new InfluxDB({
      url: process.env.INFLUX_URL || 'http://localhost:8086',
      token: process.env.INFLUX_TOKEN || 'sentry-super-secret-token',
    });
  }

  write(topic: string, value: number) {
    const writeApi = this.client.getWriteApi(this.org, this.bucket, 'ms');
    writeApi.writePoint(
      new Point('sensor_data').tag('topic', topic).floatField('value', value),
    );
    writeApi.close().catch(e => this.logger.error('InfluxDB write error', e));
  }

  async query(
    topic: string,
    from: string,
    limit: number,
    to?: string,
  ): Promise<{ time: string; value: number }[]> {
    const stopClause = to ? `, stop: ${to}` : '';
    const flux = `
      from(bucket: "${this.bucket}")
        |> range(start: ${from}${stopClause})
        |> filter(fn: (r) => r._measurement == "sensor_data")
        |> filter(fn: (r) => r.topic == "${topic}")
        |> filter(fn: (r) => r._field == "value")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: ${limit})
        |> sort(columns: ["_time"], desc: false)
    `;

    const rows: { time: string; value: number }[] = [];
    return new Promise(resolve => {
      this.client.getQueryApi(this.org).queryRows(flux, {
        next(row, meta) {
          const obj = meta.toObject(row);
          rows.push({ time: obj._time, value: obj._value });
        },
        error: e => {
          this.logger.error('InfluxDB query error', e.message);
          resolve([]);
        },
        complete: () => resolve(rows),
      });
    });
  }
}
