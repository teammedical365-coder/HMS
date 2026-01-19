import React, { useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useAppDispatch, useCachedDoctors } from '../../store/hooks';
import { fetchDoctors, fetchServices } from '../../store/slices/publicDataSlice';
import './Doctors.css';

const Doctors = () => {
  // 1. Support both Path Params (/doctors/:id) and Query Params (/doctors?serviceId=id)
  const { serviceId: paramServiceId } = useParams();
  const [searchParams] = useSearchParams();
  const queryServiceId = searchParams.get('serviceId');
  
  // Determine the active Service identifier (Slug, ID, or Title)
  const serviceId = paramServiceId || queryServiceId;

  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  
  // 2. Select Data from Redux
  // We grab the services list to lookup the proper display title
  const { services: servicesList } = useSelector((state) => state.publicData);
  const { doctors: doctorsData, loading, error } = useCachedDoctors(serviceId);

  // 3. Smart Title Logic
  // Finds the readable name (e.g., "In Vitro Fertilization") even if URL has an ID (e.g., "64f...")
  const serviceInfo = useMemo(() => {
    if (!serviceId) return { title: 'Medical Team', description: 'World-renowned fertility experts committed to your success.' };

    // Find matching service in our loaded list
    const foundService = servicesList.find(s => 
      s.id === serviceId || 
      s._id === serviceId || 
      (s.title && s.title.toLowerCase() === serviceId.replace(/-/g, ' ').toLowerCase())
    );

    if (foundService) {
      return { 
        title: foundService.title,
        description: foundService.description || `Highly qualified specialists dedicated to ${foundService.title} treatments.`
      };
    }

    // Fallback: Format the ID string (e.g., "male-fertility" -> "Male Fertility")
    // If it looks like a MongoDB ID (24 hex chars), just say "Specialists"
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(serviceId);
    const formattedTitle = isMongoId 
      ? 'Specialist' 
      : serviceId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return { 
      title: formattedTitle,
      description: `Highly qualified specialists dedicated to your health and well-being.`
    };
  }, [serviceId, servicesList]);

  // 4. Map doctors to display format
  const doctors = useMemo(() => {
    return doctorsData.map((doctor, index) => ({
      id: doctor._id || doctor.doctorId,
      name: doctor.name.toLowerCase().startsWith('dr.') ? doctor.name : `Dr. ${doctor.name}`,
      specialty: doctor.specialty || 'Fertility Specialist', // Backend now handles smart filtering, so we trust this
      services: doctor.services || [],
      experience: doctor.experience || 'Experienced',
      patients: doctor.patientsCount || '100+',
      education: doctor.education || 'MD, Specialist',
      image: doctor.image || (index % 2 === 0 ? '👩‍⚕️' : '👨‍⚕️')
    }));
  }, [doctorsData]);

  // Effects
  useEffect(() => {
    // Ensure services are loaded so we can lookup titles
    if (servicesList.length === 0) {
      dispatch(fetchServices());
    }
    // Fetch doctors based on the ID
    dispatch(fetchDoctors(serviceId || null));
  }, [serviceId, dispatch, servicesList.length]);

  // Scroll Animation
  useEffect(() => {
    window.scrollTo(0, 0);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.1 });

    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach((el) => observer.observe(el));
    return () => elements.forEach((el) => observer.unobserve(el));
  }, [doctors.length, serviceId]);

  // Handlers
  const handleBookAppointment = (doctorId) => {
    // Pass the service ID along to pre-fill the appointment form if possible
    const serviceParam = serviceId ? `&serviceId=${serviceId}` : '';
    navigate(`/appointment?doctorId=${doctorId}${serviceParam}`);
  };

  return (
    <div className="doctors-page">
      <div className="content-wrapper">
        
        {/* Header Section */}
        <section className="doctors-header animate-on-scroll slide-up">
          <Link to="/services" className="back-link">
            <span className="back-arrow">←</span> Back to Services
          </Link>
          
          <div className="header-content">
            <span className="badge">Meet Our Experts</span>
            <h1>
              {serviceId ? (
                <>
                  <span className="text-gradient">{serviceInfo.title}</span> Specialists
                </>
              ) : (
                <>
                  Our <span className="text-gradient">Medical Team</span>
                </>
              )}
            </h1>
            <p className="header-subtext">
              {serviceInfo.description}
            </p>
          </div>
        </section>

        {/* Doctors Grid */}
        <section className="doctors-grid-section">
          {loading ? (
            <div className="loading-message">
              <div className="loading-spinner"></div>
              <p>Finding the best specialists for you...</p>
            </div>
          ) : error ? (
            <div className="error-message">Unable to load doctors. Please try again later.</div>
          ) : doctors.length > 0 ? (
            <div className="doctors-grid">
              {doctors.map((doctor, index) => (
                <div
                  key={doctor.id}
                  className={`doctor-card animate-on-scroll slide-up delay-${(index % 3) * 100}`}
                >
                  {/* Doctor Image */}
                  <div className="doctor-image-wrapper">
                    <div className="doctor-image">
                      {doctor.image && doctor.image.startsWith('http') ? (
                         <img src={doctor.image} alt={doctor.name} />
                      ) : (
                         <span className="doctor-emoji">{doctor.image}</span>
                      )}
                    </div>
                    <div className="image-overlay"></div>
                  </div>

                  {/* Doctor Info */}
                  <div className="doctor-info">
                    <span className="specialty-badge">{doctor.specialty}</span>
                    <h3>{doctor.name}</h3>
                    <p className="education">{doctor.education}</p>
                    
                    {/* Stats */}
                    <div className="doctor-stats">
                      <div className="stat-item">
                        <span className="stat-icon">🎓</span>
                        <span className="stat-value">{doctor.experience}</span>
                        <span className="stat-label">Experience</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-icon">🏥</span>
                        <span className="stat-value">{doctor.patients}</span>
                        <span className="stat-label">Patients</span>
                      </div>
                    </div>

                    {/* Services Tags (Visual only) */}
                    <div className="services-tags">
                       {/* We prioritize the current service tag if it exists */}
                       {serviceId && <span className="service-tag active">{serviceInfo.title}</span>}
                       {doctor.services
                         .filter(s => s !== serviceId && s !== serviceInfo.title) // valid attempt to filter duplicates
                         .slice(0, 2)
                         .map((s, i) => (
                           <span key={i} className="service-tag">
                             {/* Try to make slug readable if it's a slug */}
                             {s.length < 20 ? s.replace(/-/g, ' ') : 'Specialized Care'}
                           </span>
                       ))}
                    </div>

                    {/* Action Button */}
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleBookAppointment(doctor.id)}
                    >
                      Book Appointment
                    </button>
                  </div>

                  {/* Card Hover Effect */}
                  <div className="card-hover-effect"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-doctors-found animate-on-scroll fade-in">
              <div className="empty-state">
                <div className="empty-icon">👨‍⚕️</div>
                <h3>No Specialists Found</h3>
                <p>
                  We couldn't find a doctor specifically matching <strong>"{serviceInfo.title}"</strong> at the moment.
                </p>
                <p>However, our general fertility experts are available to assist you.</p>
                <div className="empty-actions">
                  <button onClick={() => navigate('/doctors')} className="btn btn-secondary">
                    View All Doctors
                  </button>
                  <button onClick={() => navigate('/appointment')} className="btn btn-primary">
                    Book General Consultation
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* CTA Section */}
        {doctors.length > 0 && !loading && (
          <section className="doctors-cta animate-on-scroll fade-in">
            <div className="cta-card">
              <h2>Need Help Choosing a Doctor?</h2>
              <p>Our patient coordinators can help you find the perfect specialist for your needs.</p>
              <button className="btn btn-white" onClick={() => navigate('/appointment')}>
                Get Personalized Recommendation
              </button>
            </div>
          </section>
        )}

      </div>
    </div>
  );
};

export default Doctors;