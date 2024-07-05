import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportUrl, setReportUrl] = useState(null);

  const handleAudit = async () => {
    setLoading(true);
    setReportUrl(null);
    try {
      const response = await axios.post('/api/audit', { url, name });
      setReportUrl(response.data.reportUrl);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <h1>Accessibility Audit Tool</h1>
      <div className="form-group">
        <label htmlFor="url">Enter URL:</label>
        <input
          type="text"
          id="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL"
        />
      </div>
      <div className="form-group">
        <label htmlFor="name">Enter Your Name:</label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter Your Name"
        />
      </div>
      <button onClick={handleAudit} disabled={loading}>
        {loading ? 'Auditing...' : 'Audit Website'}
      </button>
      {reportUrl && (
        <div className="report">
          <a href={reportUrl} download="accessibility_report.pdf">Download Report</a>
        </div>
      )}
    </div>
  );
}

export default App;
