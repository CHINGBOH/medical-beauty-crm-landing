export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export interface AppointmentRecord {
  id: number;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  staffId: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
  notes?: string;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAppointmentInput {
  customerId?: number;
  customerName: string;
  customerPhone: string;
  staffId: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
  notes?: string;
  idempotencyKey?: string;
}

export function isTimeRangeValid(startAt: Date, endAt: Date): boolean {
  return startAt.getTime() < endAt.getTime();
}



const appointmentStatusTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransitionStatus(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return true;
  return appointmentStatusTransitions[from].includes(to);
}

function canRescheduleStatus(status: AppointmentStatus): boolean {
  return status === "pending" || status === "confirmed";
}

export function hasTimeConflict(
  appointments: AppointmentRecord[],
  staffId: string,
  startAt: Date,
  endAt: Date,
  excludeId?: number
): boolean {
  return appointments.some((appointment) => {
    if (appointment.staffId !== staffId) return false;
    if (excludeId && appointment.id === excludeId) return false;
    if (appointment.status === "cancelled") return false;

    const existingStart = appointment.startAt.getTime();
    const existingEnd = appointment.endAt.getTime();
    return startAt.getTime() < existingEnd && endAt.getTime() > existingStart;
  });
}

export class InMemoryAppointmentStore {
  private appointments: AppointmentRecord[] = [];
  private nextId = 1;
  private idempotentCreateIndex = new Map<string, number>();

  list(): AppointmentRecord[] {
    return [...this.appointments].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  getById(id: number): AppointmentRecord | undefined {
    return this.appointments.find((item) => item.id === id);
  }

  clear(): void {
    this.appointments = [];
    this.nextId = 1;
    this.idempotentCreateIndex.clear();
  }

  create(input: CreateAppointmentInput): AppointmentRecord {
    if (input.idempotencyKey) {
      const existedId = this.idempotentCreateIndex.get(input.idempotencyKey);
      if (existedId) {
        const existed = this.getById(existedId);
        if (existed) return existed;
      }
    }

    if (!isTimeRangeValid(input.startAt, input.endAt)) {
      throw new Error("预约时间区间无效：结束时间必须大于开始时间");
    }

    if (hasTimeConflict(this.appointments, input.staffId, input.startAt, input.endAt)) {
      throw new Error("该咨询师在当前时段已有预约");
    }

    const now = new Date();
    const record: AppointmentRecord = {
      id: this.nextId++,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      staffId: input.staffId,
      staffName: input.staffName,
      startAt: input.startAt,
      endAt: input.endAt,
      notes: input.notes,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    this.appointments.push(record);
    if (input.idempotencyKey) {
      this.idempotentCreateIndex.set(input.idempotencyKey, record.id);
    }
    return record;
  }

  updateStatus(id: number, status: AppointmentStatus): AppointmentRecord {
    const appointment = this.getById(id);
    if (!appointment) {
      throw new Error("预约不存在");
    }

    if (!canTransitionStatus(appointment.status, status)) {
      throw new Error(`状态流转不合法：${appointment.status} -> ${status}`);
    }

    appointment.status = status;
    appointment.updatedAt = new Date();
    return appointment;
  }

  reschedule(id: number, startAt: Date, endAt: Date): AppointmentRecord {
    const appointment = this.getById(id);
    if (!appointment) {
      throw new Error("预约不存在");
    }

    if (!isTimeRangeValid(startAt, endAt)) {
      throw new Error("预约时间区间无效：结束时间必须大于开始时间");
    }

    if (!canRescheduleStatus(appointment.status)) {
      throw new Error(`改约失败：当前状态 ${appointment.status} 不允许改约`);
    }

    if (hasTimeConflict(this.appointments, appointment.staffId, startAt, endAt, id)) {
      throw new Error("改约失败：该咨询师在当前时段已有预约");
    }

    appointment.startAt = startAt;
    appointment.endAt = endAt;
    appointment.updatedAt = new Date();
    return appointment;
  }

  calendar(startAt: Date, endAt: Date): AppointmentRecord[] {
    return this.list().filter((appointment) => {
      const startsInside = appointment.startAt.getTime() >= startAt.getTime() && appointment.startAt.getTime() <= endAt.getTime();
      const overlaps = appointment.startAt.getTime() < endAt.getTime() && appointment.endAt.getTime() > startAt.getTime();
      return startsInside || overlaps;
    });
  }
}

export const appointmentStore = new InMemoryAppointmentStore();
