import React from 'react';
import ReactDOM from 'react-dom/client';
import OperationsHubPage from './OperationsHubPage';
import './styles.css';
import './brand.css';
const props={workers:[],badges:[],anchors:[],incidents:[],apiState:'API unavailable',dataSource:'sample',demoModeActive:false,isConfigured:false,isAdmin:true,peopleReporting:0,positionStreamStale:true,onExportReport:()=>{},onNotify:()=>{},onNavigate:()=>{},onToggleDemo:()=>{}};
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><div className="operations-hub-standalone"><OperationsHubPage {...props}/></div></React.StrictMode>);
