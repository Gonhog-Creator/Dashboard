// Importing this module registers all jobs and exposes the scheduler API.
import "./weatherJob";
import "./fitsScanJob";

export { startScheduler, runJob, listRegisteredJobs } from "./scheduler";
