// Importing this module registers all jobs and exposes the scheduler API.
import "./weatherJob";
import "./fitsScanJob";
import "./reportJob";
import "./scienceNewsJob";
import "./financeSyncJob";
import "./financeSnapshotJob";
import "./cocPollJob";
import "./cocSnapshotJob";
import "./cocMetaJob";

export { startScheduler, runJob, listRegisteredJobs } from "./scheduler";
